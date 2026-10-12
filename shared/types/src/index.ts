/**
 * DEFINICIONES DE TIPOS CENTRALES - TRANSPORTES LA SOLUCIÓN
 * V1.1: Refinado para roles (admin, driver), autenticación telefónica,
 *       solicitudes de transporte, relay experimental y métricas mensuales.
 */

// ==============================================================================
// 1. ROLES Y AUTENTICACIÓN
// ==============================================================================
export type UserRole = 'admin' | 'driver';

export interface Profile {
  id: string; // UUID coincidente con auth.users.id
  email: string;
  fullName: string;
  phone: string;
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRoleAssignment {
  userId: string;
  role: UserRole;
  assignedAt: string;
  assignedBy?: string | null;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  driverId?: string | null;
  mustChangePassword?: boolean;
}

export interface DriverPhoneAuthCredentials {
  phoneNumber: string; // Formato internacional, ej: 50688888888
  password: string;
}

// ==============================================================================
// 2. CONDUCTORES Y DISPOSITIVOS
// ==============================================================================
export type DriverStatus = 'active' | 'inactive' | 'suspended';

export interface Driver {
  id: string; // UUID primario
  userId: string; // Referencia a profiles.id
  fullName: string;
  identificationNumber: string; // Cédula o pasaporte
  licenseNumber: string;
  licenseExpiresAt: string;
  phone: string;
  phoneNumber: string; // Normalizado internacional
  whatsappNumber?: string | null;
  status: DriverStatus;
  active: boolean;
  mustChangePassword: boolean;
  currentVehicleId?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriverDevice {
  id: string;
  driverId: string;
  deviceFingerprint: string;
  model: string;
  osVersion: string;
  appVersion: string;
  lastSeenAt: string;
  isTrusted: boolean;
  publicKey?: string | null;
}

// ==============================================================================
// 3. VEHÍCULOS Y ASIGNACIONES
// ==============================================================================
export type VehicleType = 'sedan' | 'suv' | 'van_vip' | 'minibus';
export type VehicleStatus = 'available' | 'in_service' | 'maintenance' | 'inactive';

export interface Vehicle {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  year: number;
  type: VehicleType;
  passengerCapacity: number;
  luggageCapacityPieces: number;
  status: VehicleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DriverVehicleAssignment {
  id: string;
  driverId: string;
  vehicleId: string;
  assignedAt: string;
  unassignedAt?: string | null;
  assignedBy: string;
  notes?: string | null;
}

// ==============================================================================
// 4. TURNOS DE TRABAJO (WORK SHIFTS)
// ==============================================================================
export type ShiftStatus = 'active' | 'completed' | 'terminated_admin';

export interface WorkShift {
  id: string;
  driverId: string;
  vehicleId: string;
  startedAt: string;
  endedAt?: string | null;
  startOdometerKm?: number | null;
  endOdometerKm?: number | null;
  status: ShiftStatus;
  notes?: string | null;
}

// ==============================================================================
// 5. SOLICITUDES DE TRANSPORTE Y VIAJES
// ==============================================================================
export type TransportRequestStatus = 
  | 'new'
  | 'whatsapp_opened'
  | 'reviewed'
  | 'accepted'
  | 'rejected'
  | 'converted_to_trip'
  | 'cancelled';

export interface TransportRequest {
  id: string;
  requestNumber: string; // Formato TLS-YYYYMMDD-0001
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string | null;
  tripDate: string; // YYYY-MM-DD
  tripTime?: string | null; // HH:MM:SS
  originAddress: string;
  destinationAddress: string;
  adultsCount: number;
  minorsCount: number;
  hasLuggage: boolean;
  specialNotes?: string | null;
  
  // Ubicación de recogida
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  pickupAccuracyMeters?: number | null;
  pickupCanton?: string | null;
  pickupDistrict?: string | null;
  
  status: TransportRequestStatus;
  whatsappOpenedAt?: string | null;
  convertedTripId?: string | null;
  
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransportRequestInput {
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string | null;
  tripDate: string;
  tripTime?: string | null;
  originAddress: string;
  destinationAddress: string;
  adultsCount: number;
  minorsCount: number;
  hasLuggage: boolean;
  specialNotes?: string | null;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  pickupAccuracyMeters?: number | null;
  pickupCanton?: string | null;
  pickupDistrict?: string | null;
}

export type TripStatus =
  | 'created'
  | 'assigned'
  | 'driver_en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface Trip {
  id: string;
  reservationId?: string | null;
  transportRequestId?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
  status: TripStatus;
  scheduledStartAt: string;
  actualStartedAt?: string | null;
  actualEndedAt?: string | null;
  totalDistanceMeters?: number | null;
  totalDurationSeconds?: number | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==============================================================================
// 6. TELEMETRÍA GPS Y RELAY ENTRE DISPOSITIVOS
// ==============================================================================
export interface GpsLocationSample {
  deviceEventId: string;
  driverId: string;
  tripId?: string | null;
  vehicleId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedMps: number;
  headingDegrees: number;
  altitudeMeters?: number | null;
  batteryLevel?: number | null;
  provider: 'gps' | 'network' | 'fused';
  isMocked: boolean;
  capturedAt: string;
  uploadedAt?: string;
}

export interface DriverCurrentLocation {
  driverId: string;
  vehicleId: string;
  tripId?: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedMps: number;
  headingDegrees: number;
  isOnline: boolean;
  lastCapturedAt: string;
  updatedAt: string;
}

export interface GpsBatchUploadResponseV2 {
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  rejectedEvents?: Array<{ deviceEventId: string; reasonCode: string }>;
  latestCapturedAt?: string | null;
}

export interface DeviceRelayEvent {
  id: string;
  originDeviceId: string;
  relayDeviceId: string;
  deviceEventId: string;
  payloadEncrypted: string;
  signature: string;
  hopCount: number;
  status: 'received' | 'processed' | 'rejected';
  receivedAt: string;
}

// ==============================================================================
// 7. MÉTRICAS Y BORRADO MENSUAL (PURGE)
// ==============================================================================
export interface DriverDailyMetrics {
  id: string;
  metricDate: string;
  driverId: string;
  vehicleId: string;
  totalDistanceKm: number;
  movingTimeSeconds: number;
  idleTimeSeconds: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  totalTripsCompleted: number;
  shiftDurationSeconds: number;
  calculatedAt: string;
}

export interface DriverMonthlyMetrics {
  id: string;
  metricMonth: string; // YYYY-MM-01
  driverId: string;
  totalDistanceKm: number;
  totalTripsCompleted: number;
  totalMovingTimeHours: number;
  totalIdleTimeHours: number;
  averageSpeedKmh: number;
  maxSpeedKmh: number;
  incidentsCount: number;
  checksum: string;
  createdAt: string;
}

export interface PurgeExecutionLog {
  id: string;
  periodClosedDate: string;
  recordsDeletedLocationHistory: number;
  recordsDeletedRelayEvents: number;
  recordsDeletedSyncAttempts: number;
  executedBy: string;
  status: 'success' | 'failed' | 'aborted';
  details?: string | null;
  executedAt: string;
}

// ==============================================================================
// 8. INCIDENTES, AUDITORÍA Y CONFIGURACIÓN
// ==============================================================================
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentType = 'mechanical_breakdown' | 'flat_tire' | 'traffic_delay' | 'accident' | 'medical' | 'other';

export interface Incident {
  id: string;
  driverId: string;
  tripId?: string | null;
  vehicleId?: string | null;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  isResolved: boolean;
  reportedAt: string;
  resolvedAt?: string | null;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  action: string;
  entityName: string;
  entityId: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  recordedAt: string;
}

export interface AppConfiguration {
  key: string;
  value: string;
  description?: string | null;
  updatedAt: string;
}
