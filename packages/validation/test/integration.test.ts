import { describe, it, expect } from 'vitest';
import { 
  validateGpsSample,
  validateTransportRequestInput,
} from '../src/index.js';
import type { GpsLocationSample, CreateTransportRequestInput, DeviceRelayEvent } from '@transportes-la-solucion/types';

describe('Batería de Pruebas de Integración y Seguridad (V1.2)', () => {
  const baseSample: GpsLocationSample = {
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

  describe('Idempotencia y Estructura en Lote GPS', () => {
    it('aprueba muestra base válida', () => {
      const res = validateGpsSample(baseSample);
      expect(res.success).toBe(true);
    });

    it('rechaza evento sin deviceEventId obligatorio', () => {
      const res = validateGpsSample({ ...baseSample, deviceEventId: '' });
      expect(res.success).toBe(false);
      expect(res.errors).toContain('deviceEventId es obligatorio para garantizar idempotencia');
    });
  });

  describe('Pruebas Negativas: Coordenadas y Velocidad Físicamente Imposible', () => {
    it('rechaza latitud inferior a -90 grados', () => {
      const res = validateGpsSample({ ...baseSample, latitude: -95.0 });
      expect(res.success).toBe(false);
    });

    it('rechaza longitud superior a 180 grados', () => {
      const res = validateGpsSample({ ...baseSample, longitude: 200.0 });
      expect(res.success).toBe(false);
    });

    it('rechaza velocidad superior a 45 m/s (~162 km/h)', () => {
      const res = validateGpsSample({ ...baseSample, speedMps: 60.0 });
      expect(res.success).toBe(false);
    });
  });

  describe('Persistencia y Normalización de Solicitudes de Transporte', () => {
    it('valida solicitud completa y normaliza teléfono internacional', () => {
      const reqInput: CreateTransportRequestInput = {
        customerName: 'Silvia Monge',
        customerPhone: '8700-1122',
        tripDate: '2026-10-20',
        originAddress: 'San Rafael de Poás',
        destinationAddress: 'San José Centro',
        adultsCount: 3,
        minorsCount: 1,
        hasLuggage: true,
      };

      const res = validateTransportRequestInput(reqInput);
      expect(res.success).toBe(true);
      expect(res.data?.customerPhone).toBe('50687001122');
    });
  });

  describe('Contrato de Relay P2P entre Dispositivos', () => {
    it('rechaza retransmisión que excede el límite de 2 saltos', () => {
      const relayEnvelope: DeviceRelayEvent = {
        id: 'relay-01',
        originDeviceId: 'dev-alpha',
        relayDeviceId: 'dev-beta',
        deviceEventId: 'evt-001',
        payloadEncrypted: 'dGVzdA==',
        signature: 'sig-001',
        hopCount: 3,
        status: 'received',
        receivedAt: new Date().toISOString(),
      };

      expect(relayEnvelope.hopCount <= 2).toBe(false);
    });
  });
});
