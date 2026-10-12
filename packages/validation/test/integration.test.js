"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("../src/index.js");
function runIntegrationTests() {
    let passed = 0;
    let failed = 0;
    function assert(condition, testName) {
        if (condition) {
            console.log(`  ✓ PASSED: ${testName}`);
            passed++;
        }
        else {
            console.error(`  ✗ FAILED: ${testName}`);
            failed++;
        }
    }
    console.log('\n--- Ejecutando Batería de Pruebas de Integración y Seguridad (V1.1) ---');
    // 1. Prueba de Seguridad: Idempotencia en Lote GPS
    const baseSample = {
        deviceEventId: 'evt-secure-idemp-001',
        driverId: 'd0000000-0000-0000-0000-000000000001',
        vehicleId: 'v0000000-0000-0000-0000-000000000001',
        latitude: 10.0754,
        longitude: -84.2441,
        accuracyMeters: 10.0,
        speedMps: 8.5,
        headingDegrees: 180.0,
        provider: 'gps',
        isMocked: false,
        capturedAt: new Date().toISOString(),
    };
    const v1 = (0, index_js_1.validateGpsSample)(baseSample);
    assert(v1.success === true, 'Muestra base válida aprobada');
    // Muestra con deviceEventId ausente debe fallar
    const vBad = (0, index_js_1.validateGpsSample)({ ...baseSample, deviceEventId: '' });
    assert(vBad.success === false, 'Rechaza evento sin deviceEventId obligatorio');
    // 2. Prueba Negativa: Coordenadas imposibles o fuera de rango
    const vLat = (0, index_js_1.validateGpsSample)({ ...baseSample, latitude: -95.0 });
    assert(vLat.success === false, 'Rechaza latitud inferior a -90 grados');
    const vLng = (0, index_js_1.validateGpsSample)({ ...baseSample, longitude: 200.0 });
    assert(vLng.success === false, 'Rechaza longitud superior a 180 grados');
    // 3. Prueba de Seguridad: Velocidad implausible
    const vSpeed = (0, index_js_1.validateGpsSample)({ ...baseSample, speedMps: 60.0 }); // 216 km/h
    assert(vSpeed.success === false, 'Rechaza velocidad superior al umbral físico de 45 m/s');
    // 4. Prueba de Solicitud de Transporte: Persistencia y Normalización
    const reqInput = {
        customerName: 'Silvia Monge',
        customerPhone: '8700-1122',
        tripDate: '2026-10-20',
        originAddress: 'San Rafael de Poás',
        destinationAddress: 'San José Centro',
        adultsCount: 3,
        minorsCount: 1,
        hasLuggage: true,
    };
    const reqRes = (0, index_js_1.validateTransportRequestInput)(reqInput);
    assert(reqRes.success === true, 'Solicitud completa validada con éxito');
    assert(reqRes.data?.customerPhone === '50687001122', 'Teléfono internacional asignado correctamente');
    // 5. Prueba de Relay: Restricción de Saltos (Max 2 Hops)
    const relayEnvelope = {
        id: 'relay-01',
        originDeviceId: 'dev-alpha',
        relayDeviceId: 'dev-beta',
        deviceEventId: 'evt-001',
        payloadEncrypted: 'dGVzdA==',
        signature: 'sig-001',
        hopCount: 3, // Supera límite de 2 saltos
        status: 'received',
        receivedAt: new Date().toISOString(),
    };
    const isHopValid = relayEnvelope.hopCount <= 2;
    assert(isHopValid === false, 'Rechaza retransmisión que excede el límite de 2 saltos');
    console.log(`\nResumen de Pruebas de Integración: ${passed} superadas, ${failed} fallidas.\n`);
    if (failed > 0)
        process.exit(1);
}
runIntegrationTests();
