import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import type { 
  AuthSessionUser, 
  UserRole, 
  Driver, 
  GpsLocationSample,
  GpsBatchUploadResponseV2,
  CreateTransportRequestInput,
  TransportRequest
} from '@transportes-la-solucion/types';
import { 
  validateGpsSample, 
  normalizePhoneNumber, 
  validateTransportRequestInput 
} from '@transportes-la-solucion/validation';

export interface TransportesClientOptions {
  supabaseUrl: string;
  supabasePublishableKey: string;
  storage?: Storage;
}

/**
 * Convierte un teléfono normalizado en el alias técnico invisible de Supabase Auth.
 * Ejemplo: '50688888888' -> '50688888888@drivers.internal'
 */
export function formatTechnicalDriverEmail(phone: string): string {
  const clean = normalizePhoneNumber(phone);
  return `${clean}@drivers.internal`;
}

export class TransportesApiClient {
  private client: SupabaseClient;

  constructor(options: TransportesClientOptions) {
    this.client = createClient(options.supabaseUrl, options.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: options.storage || (typeof window !== 'undefined' ? window.localStorage : undefined),
      },
    });
  }

  public getRawClient(): SupabaseClient {
    return this.client;
  }

  // ============================================================================
  // AUTENTICACIÓN TELEFÓNICA (CHOFERES) Y ADMINISTRATIVA
  // ============================================================================

  /**
   * Inicia sesión para conductores utilizando EXCLUSIVAMENTE número de teléfono y contraseña.
   * Sin requerir email al usuario.
   */
  async signInWithPhone(phone: string, pass: string): Promise<{ user: AuthSessionUser; session: Session }> {
    const technicalEmail = formatTechnicalDriverEmail(phone);
    return this.signInWithEmail(technicalEmail, pass);
  }

  /**
   * Inicia sesión con correo y contraseña para administradores.
   */
  async signInWithEmail(email: string, pass: string): Promise<{ user: AuthSessionUser; session: Session }> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: pass,
    });

    if (error || !data.user || !data.session) {
      throw new Error(error?.message || 'Credenciales de acceso inválidas');
    }

    // Obtener roles asignados del usuario autenticado
    const { data: rolesData, error: rolesError } = await this.client
      .from('user_roles')
      .select('role')
      .eq('user_id', data.user.id);

    if (rolesError) {
      throw new Error(`Error al verificar roles de usuario: ${rolesError.message}`);
    }

    const roles = (rolesData || []).map((r) => r.role as UserRole);

    let driverId: string | null = null;
    let mustChangePassword = false;

    if (roles.includes('driver')) {
      const { data: driverData } = await this.client
        .from('drivers')
        .select('id, must_change_password')
        .eq('user_id', data.user.id)
        .maybeSingle();
      
      driverId = driverData?.id || null;
      mustChangePassword = driverData?.must_change_password || false;
    }

    const userProfile: AuthSessionUser = {
      id: data.user.id,
      email: data.user.email || '',
      fullName: (data.user.user_metadata?.full_name as string) || '',
      roles,
      driverId,
      mustChangePassword,
    };

    return { user: userProfile, session: data.session };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(`Error al cerrar sesión: ${error.message}`);
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  // ============================================================================
  // SOLICITUDES PÚBLICAS DE TRANSPORTE
  // ============================================================================

  /**
   * Crea una solicitud pública de transporte en PostgreSQL generando número correlativo TLS-YYYYMMDD-XXXX.
   * Obligatorio persistir ANTES de abrir WhatsApp.
   */
  async createTransportRequest(input: CreateTransportRequestInput): Promise<TransportRequest> {
    const validation = validateTransportRequestInput(input);
    if (!validation.success || !validation.data) {
      throw new Error(`Datos de solicitud inválidos: ${(validation.errors || []).join(', ')}`);
    }

    const validData = validation.data;

    const { data, error } = await this.client
      .from('transport_requests')
      .insert({
        customer_name: validData.customerName,
        customer_phone: validData.customerPhone,
        customer_whatsapp: validData.customerWhatsapp,
        trip_date: validData.tripDate,
        trip_time: validData.tripTime || null,
        origin_address: validData.originAddress,
        destination_address: validData.destinationAddress,
        adults_count: validData.adultsCount,
        minors_count: validData.minorsCount,
        has_luggage: validData.hasLuggage,
        special_notes: validData.specialNotes || null,
        pickup_latitude: validData.pickupLatitude || null,
        pickup_longitude: validData.pickupLongitude || null,
        pickup_accuracy_meters: validData.pickupAccuracyMeters || null,
        pickup_canton: validData.pickupCanton || null,
        pickup_district: validData.pickupDistrict || null,
        status: 'new',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Error al persistir la solicitud en el servidor: ${error.message}`);
    }

    return {
      id: data.id,
      requestNumber: data.request_number,
      customerName: data.customer_name,
      customerPhone: data.customer_phone,
      customerWhatsapp: data.customer_whatsapp,
      tripDate: data.trip_date,
      tripTime: data.trip_time,
      originAddress: data.origin_address,
      destinationAddress: data.destination_address,
      adultsCount: data.adults_count,
      minorsCount: data.minors_count,
      hasLuggage: data.has_luggage,
      specialNotes: data.special_notes,
      pickupLatitude: data.pickup_latitude,
      pickupLongitude: data.pickup_longitude,
      pickupAccuracyMeters: data.pickup_accuracy_meters,
      pickupCanton: data.pickup_canton,
      pickupDistrict: data.pickup_district,
      status: data.status,
      whatsappOpenedAt: data.whatsapp_opened_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Marca que el usuario abrió WhatsApp tras guardar la solicitud.
   */
  async markTransportRequestWhatsappOpened(requestId: string): Promise<void> {
    const { error } = await this.client
      .from('transport_requests')
      .update({
        status: 'whatsapp_opened',
        whatsapp_opened_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) {
      console.warn(`No se pudo marcar whatsapp_opened_at: ${error.message}`);
    }
  }

  // ============================================================================
  // TELEMETRÍA GPS V2 CON MANEJO DE ERRORES Y RPC SEGURA
  // ============================================================================

  async uploadGpsBatchV2(samples: GpsLocationSample[]): Promise<GpsBatchUploadResponseV2> {
    if (!samples || samples.length === 0) {
      return { acceptedCount: 0, duplicateCount: 0, rejectedCount: 0 };
    }

    const validSamples: GpsLocationSample[] = [];
    const rejectedEvents: Array<{ deviceEventId: string; reasonCode: string }> = [];

    for (const sample of samples) {
      const validation = validateGpsSample(sample);
      if (validation.success && validation.data) {
        validSamples.push(validation.data);
      } else {
        rejectedEvents.push({
          deviceEventId: sample.deviceEventId || 'UNKNOWN',
          reasonCode: 'VALIDATION_FAILED',
        });
      }
    }

    if (validSamples.length === 0) {
      return {
        acceptedCount: 0,
        duplicateCount: 0,
        rejectedCount: rejectedEvents.length,
        rejectedEvents,
      };
    }

    const { data, error } = await this.client.rpc('ingest_gps_batch_v2', {
      p_samples: validSamples.map((s) => ({
        device_event_id: s.deviceEventId,
        driver_id: s.driverId,
        trip_id: s.tripId || null,
        vehicle_id: s.vehicleId,
        latitude: s.latitude,
        longitude: s.longitude,
        accuracy_meters: s.accuracyMeters,
        speed_mps: s.speedMps,
        heading_degrees: s.headingDegrees,
        altitude_meters: s.altitudeMeters || null,
        battery_level: s.batteryLevel || null,
        provider: s.provider,
        is_mocked: s.isMocked,
        captured_at: s.capturedAt,
      })),
    });

    if (error) {
      throw new Error(`Error en la RPC de telemetría: ${error.message}`);
    }

    const rpcRejected = (data?.rejected_events as Array<{ deviceEventId: string; reasonCode: string }>) || [];
    const totalRejected = [...rejectedEvents, ...rpcRejected];

    return {
      acceptedCount: (data?.accepted_count as number) || 0,
      duplicateCount: (data?.duplicate_count as number) || 0,
      rejectedCount: totalRejected.length,
      rejectedEvents: totalRejected.length > 0 ? totalRejected : undefined,
      latestCapturedAt: data?.latest_captured_at || null,
    };
  }

  // ============================================================================
  // CONDUCTORES - PERFIL Y ASIGNACIONES
  // ============================================================================

  async getDriverProfile(driverId: string): Promise<Driver | null> {
    const { data, error } = await this.client
      .from('drivers')
      .select('*')
      .eq('id', driverId)
      .single();

    if (error) throw new Error(`Error al consultar perfil del conductor: ${error.message}`);
    return data as Driver;
  }
}
