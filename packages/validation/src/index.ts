import type { GpsLocationSample, CreateTransportRequestInput } from '@transportes-la-solucion/types';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * Normaliza cualquier número de teléfono al formato internacional estándar sin signos.
 * Ejemplo en Costa Rica: '8888-8888' o '8888 8888' -> '50688888888'.
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 8) {
    return `506${digits}`;
  }
  return digits;
}

/**
 * Valida si un número telefónico cuenta con una estructura internacional creíble (8 a 15 dígitos).
 */
export function validatePhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  return normalized.length >= 8 && normalized.length <= 15;
}

/**
 * Valida un correo electrónico según formato estándar RFC 5322 simplificado.
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Valida contraseña del conductor/admin:
 * Mínimo 8 caracteres, al menos 1 letra y al menos 1 número.
 */
export function validatePassword(password: string): ValidationResult<string> {
  const errors: string[] = [];
  if (!password || password.length < 8) {
    errors.push('La contraseña debe tener al menos 8 caracteres.');
  }
  if (!/[a-zA-Z]/.test(password)) {
    errors.push('La contraseña debe incluir al menos una letra.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('La contraseña debe incluir al menos un número.');
  }
  return {
    success: errors.length === 0,
    data: errors.length === 0 ? password : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validador estricto de puntos de telemetría GPS antes de persistir o calcular distancias.
 */
export function validateGpsSample(sample: GpsLocationSample): ValidationResult<GpsLocationSample> {
  const errors: string[] = [];

  // Coordenadas válidas en el globo terráqueo
  if (typeof sample.latitude !== 'number' || sample.latitude < -90 || sample.latitude > 90) {
    errors.push(`Latitud inválida: ${sample.latitude}`);
  }
  if (typeof sample.longitude !== 'number' || sample.longitude < -180 || sample.longitude > 180) {
    errors.push(`Longitud inválida: ${sample.longitude}`);
  }

  // Precisión requerida (accuracy no negativa y dentro de límite razonable)
  if (typeof sample.accuracyMeters !== 'number' || sample.accuracyMeters < 0) {
    errors.push('Precisión (accuracyMeters) no puede ser negativa');
  }

  // Velocidad no negativa y dentro del límite plausible terrestre (máx 45 m/s = 162 km/h)
  if (typeof sample.speedMps === 'number' && (sample.speedMps < 0 || sample.speedMps > 45)) {
    errors.push(`Velocidad implausible detectada: ${sample.speedMps} m/s`);
  }

  // Validar capturedAt como fecha válida
  const capturedTimestamp = Date.parse(sample.capturedAt);
  if (isNaN(capturedTimestamp)) {
    errors.push('capturedAt debe ser una fecha ISO válida');
  } else {
    // No permitir timestamps en el futuro (más de 5 minutos de reloj desfasado)
    const now = Date.now();
    if (capturedTimestamp > now + 300_000) {
      errors.push('capturedAt no puede estar en el futuro');
    }
  }

  // UUID del evento del dispositivo para idempotencia
  if (!sample.deviceEventId || sample.deviceEventId.length < 5) {
    errors.push('deviceEventId es obligatorio para garantizar idempotencia');
  }

  return {
    success: errors.length === 0,
    data: errors.length === 0 ? sample : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validador para creación de solicitudes públicas de transporte.
 */
export function validateTransportRequestInput(input: CreateTransportRequestInput): ValidationResult<CreateTransportRequestInput> {
  const errors: string[] = [];

  if (!input.customerName || input.customerName.trim().length < 2) {
    errors.push('El nombre del cliente debe tener al menos 2 caracteres.');
  }

  if (!validatePhoneNumber(input.customerPhone)) {
    errors.push('El número telefónico del cliente es inválido.');
  }

  if (!input.originAddress || input.originAddress.trim().length < 3) {
    errors.push('La dirección de recogida es obligatoria.');
  }

  if (!input.destinationAddress || input.destinationAddress.trim().length < 2) {
    errors.push('El destino del viaje es obligatorio.');
  }

  if (!input.tripDate || isNaN(Date.parse(input.tripDate))) {
    errors.push('La fecha del viaje es inválida.');
  }

  if (typeof input.adultsCount !== 'number' || input.adultsCount < 1) {
    errors.push('Debe registrarse al menos un pasajero adulto.');
  }

  return {
    success: errors.length === 0,
    data: errors.length === 0 ? {
      ...input,
      customerPhone: normalizePhoneNumber(input.customerPhone),
      customerWhatsapp: input.customerWhatsapp ? normalizePhoneNumber(input.customerWhatsapp) : normalizePhoneNumber(input.customerPhone),
    } : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };
}
