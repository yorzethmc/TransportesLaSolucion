import { describe, it, expect } from 'vitest';
import { 
  validatePassword, 
  validateGpsSample,
  normalizePhoneNumber,
  validatePhoneNumber,
  validateTransportRequestInput
} from '../src/index.js';
import type { GpsLocationSample, CreateTransportRequestInput } from '@transportes-la-solucion/types';

describe('Batería de Validación de Negocio (Transportes La Solución)', () => {
  describe('Normalización y Validación Telefónica (E.164)', () => {
    it('normaliza número local de 8 dígitos con prefijo internacional 506', () => {
      expect(normalizePhoneNumber('8888-8888')).toBe('50688888888');
    });

    it('normaliza número con formato y espacios', () => {
      expect(normalizePhoneNumber('+506 8729 2124')).toBe('50687292124');
    });

    it('valida teléfono válido de 8 dígitos', () => {
      expect(validatePhoneNumber('8888-8888')).toBe(true);
    });

    it('rechaza teléfono menor a 8 dígitos', () => {
      expect(validatePhoneNumber('123')).toBe(false);
    });
  });

  describe('Validación de Contraseñas Seguras', () => {
    it('aprueba contraseñas seguras con letra y número', () => {
      const res = validatePassword('ChoferVIP2026!');
      expect(res.success).toBe(true);
      expect(res.data).toBe('ChoferVIP2026!');
    });

    it('rechaza contraseñas con menos de 8 caracteres', () => {
      const res = validatePassword('abc');
      expect(res.success).toBe(false);
      expect(res.errors).toContain('La contraseña debe tener al menos 8 caracteres.');
    });
  });

  describe('Validación de Muestras Satelitales GPS', () => {
    const validSample: GpsLocationSample = {
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

    it('aprueba muestra GPS válida dentro de los rangos operacionales', () => {
      const res = validateGpsSample(validSample);
      expect(res.success).toBe(true);
    });

    it('rechaza latitud fuera de rango (-90 a 90)', () => {
      const res = validateGpsSample({ ...validSample, latitude: 195.0 });
      expect(res.success).toBe(false);
    });

    it('rechaza velocidad imposible (> 45 m/s o 162 km/h)', () => {
      const res = validateGpsSample({ ...validSample, speedMps: 120.0 });
      expect(res.success).toBe(false);
    });
  });

  describe('Validación de Solicitudes Públicas de Transporte', () => {
    it('aprueba y normaliza solicitud con datos requeridos', () => {
      const requestInput: CreateTransportRequestInput = {
        customerName: 'Mario Vargas',
        customerPhone: '8888-1234',
        tripDate: '2026-11-01',
        originAddress: 'San Pedro de Poás, Alajuela',
        destinationAddress: 'Aeropuerto Juan Santamaría (SJO)',
        adultsCount: 2,
        minorsCount: 0,
        hasLuggage: true,
      };

      const res = validateTransportRequestInput(requestInput);
      expect(res.success).toBe(true);
      expect(res.data?.customerPhone).toBe('50688881234');
    });
  });
});
