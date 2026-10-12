"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("../src/index.js");
function runTests() {
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
    console.log('\n--- Ejecutando Batería de Pruebas Unitarias de Validación (V1.1) ---');
    // Test 1: Validar Emails
    assert((0, index_js_1.validateEmail)('admin@transporteslasolucion.com') === true, 'Email corporativo válido');
    assert((0, index_js_1.validateEmail)('invalido-sin-arroba') === false, 'Rechaza email sin arroba');
    // Test 2: Normalización Telefónica E.164
    assert((0, index_js_1.normalizePhoneNumber)('8888-8888') === '50688888888', 'Normaliza número local 8 dígitos a prefijo 506');
    assert((0, index_js_1.normalizePhoneNumber)('+506 8729 2124') === '50687292124', 'Normaliza número con formato y espacios');
    assert((0, index_js_1.validatePhoneNumber)('8888-8888') === true, 'Valida teléfono de 8 dígitos');
    assert((0, index_js_1.validatePhoneNumber)('123') === false, 'Rechaza teléfono demasiado corto');
    // Test 3: Validar Contraseñas
    assert((0, index_js_1.validatePassword)('ChoferVIP2026!').success === true, 'Contraseña segura aprobada');
    assert((0, index_js_1.validatePassword)('abc').success === false, 'Rechaza contraseña menor a 8 caracteres');
    // Test 4: Validar Muestra GPS Válida
    const validSample = {
        deviceEventId: 'evt-test-uuid-001',
        driverId: 'd0000000-0000-0000-0000-000000000001',
        vehicleId: 'v0000000-0000-0000-0000-000000000001',
        latitude: 10.0754,
        longitude: -84.2441,
        accuracyMeters: 12.5,
        speedMps: 11.2,
        headingDegrees: 180.0,
        provider: 'gps',
        isMocked: false,
        capturedAt: new Date().toISOString(),
    };
    assert((0, index_js_1.validateGpsSample)(validSample).success === true, 'Muestra satelital en Poás aprobada');
    // Test 5: Muestra GPS con coordenadas corruptas o velocidad imposible
    assert((0, index_js_1.validateGpsSample)({ ...validSample, latitude: 195.0 }).success === false, 'Rechaza latitud fuera de rango');
    assert((0, index_js_1.validateGpsSample)({ ...validSample, speedMps: 120.0 }).success === false, 'Rechaza velocidad imposible (> 150 km/h)');
    // Test 6: Validar Solicitud Pública de Transporte
    const requestInput = {
        customerName: 'Mario Vargas',
        customerPhone: '8888-1234',
        tripDate: '2026-11-01',
        originAddress: 'San Pedro de Poás, Alajuela',
        destinationAddress: 'Aeropuerto Juan Santamaría (SJO)',
        adultsCount: 2,
        minorsCount: 0,
        hasLuggage: true,
    };
    const reqVal = (0, index_js_1.validateTransportRequestInput)(requestInput);
    assert(reqVal.success === true, 'Solicitud de transporte válida aprobada');
    assert(reqVal.data?.customerPhone === '50688881234', 'Teléfono de solicitud normalizado a 50688881234');
    console.log(`\nResumen de Pruebas: ${passed} superadas, ${failed} fallidas.\n`);
    if (failed > 0)
        process.exit(1);
}
runTests();
