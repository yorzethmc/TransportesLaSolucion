-- ==============================================================================
-- TRANSPORTES LA SOLUCIÓN - V1 MIGRACIÓN INICIAL COMPLETA
-- Fecha: 2026-10-12
-- Stack: PostgreSQL 15+ / PostGIS / Supabase Auth
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. ENUMS DE DOMINIO Y CONTROL DE ESTADOS
DO $$ BEGIN
    CREATE TYPE user_role_type AS ENUM ('super_admin', 'dispatcher', 'driver', 'analyst');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE driver_status_type AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE vehicle_type_enum AS ENUM ('sedan', 'suv', 'van_vip', 'minibus');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE vehicle_status_enum AS ENUM ('available', 'in_service', 'maintenance', 'inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE shift_status_enum AS ENUM ('active', 'completed', 'terminated_admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE reservation_status_enum AS ENUM (
        'requested', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'no_show'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE trip_status_enum AS ENUM (
        'created', 'assigned', 'driver_en_route', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE incident_severity_enum AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE incident_type_enum AS ENUM (
        'mechanical_breakdown', 'flat_tire', 'traffic_delay', 'accident', 'medical', 'other'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ==============================================================================
-- 3. PERFILES, ROLES Y AUTENTICACIÓN
-- ==============================================================================

-- Tabla de perfiles sincronizada con auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL DEFAULT '',
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Catálogo de roles
CREATE TABLE IF NOT EXISTS public.roles (
    name user_role_type PRIMARY KEY,
    description TEXT NOT NULL
);

-- Asignación de roles por usuario
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role user_role_type NOT NULL REFERENCES public.roles(name) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role)
);

-- ==============================================================================
-- 4. CONDUCTORES Y DISPOSITIVOS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE RESTRICT,
    full_name VARCHAR(150) NOT NULL,
    identification_number VARCHAR(50) NOT NULL UNIQUE,
    license_number VARCHAR(50) NOT NULL,
    license_expires_at DATE NOT NULL,
    phone VARCHAR(30) NOT NULL,
    status driver_status_type NOT NULL DEFAULT 'active',
    current_vehicle_id UUID, -- Foreign key diferida
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.driver_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    model VARCHAR(100) NOT NULL DEFAULT 'Android Device',
    os_version VARCHAR(50) NOT NULL DEFAULT 'Android',
    app_version VARCHAR(30) NOT NULL DEFAULT '1.0.0',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_trusted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_driver_device UNIQUE (driver_id, device_fingerprint)
);

-- ==============================================================================
-- 5. VEHÍCULOS Y ASIGNACIONES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(20) NOT NULL UNIQUE,
    brand VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year SMALLINT NOT NULL CHECK (year >= 2000 AND year <= 2100),
    type vehicle_type_enum NOT NULL DEFAULT 'van_vip',
    passenger_capacity SMALLINT NOT NULL CHECK (passenger_capacity >= 1 AND passenger_capacity <= 60),
    luggage_capacity_pieces SMALLINT NOT NULL DEFAULT 8,
    status vehicle_status_enum NOT NULL DEFAULT 'available',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vincular clave foránea diferida en drivers
ALTER TABLE public.drivers 
    DROP CONSTRAINT IF EXISTS fk_driver_current_vehicle;
ALTER TABLE public.drivers 
    ADD CONSTRAINT fk_driver_current_vehicle 
    FOREIGN KEY (current_vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.driver_vehicle_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    CONSTRAINT chk_assignment_dates CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

-- ==============================================================================
-- 6. TURNOS DE TRABAJO (WORK SHIFTS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.work_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    start_odometer_km NUMERIC(9, 2),
    end_odometer_km NUMERIC(9, 2),
    status shift_status_enum NOT NULL DEFAULT 'active',
    notes TEXT,
    CONSTRAINT chk_shift_odometer CHECK (end_odometer_km IS NULL OR end_odometer_km >= start_odometer_km),
    CONSTRAINT chk_shift_duration CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- ==============================================================================
-- 7. CLIENTES, RESERVACIONES Y VIAJES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_number VARCHAR(30) NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    trip_date DATE NOT NULL,
    trip_time TIME,
    origin_text TEXT NOT NULL,
    destination_text TEXT NOT NULL,
    adults_count SMALLINT NOT NULL DEFAULT 1 CHECK (adults_count >= 1),
    minors_count SMALLINT NOT NULL DEFAULT 0 CHECK (minors_count >= 0),
    has_luggage BOOLEAN NOT NULL DEFAULT FALSE,
    special_instructions TEXT,
    
    -- Localización geográfica del cliente
    pickup_geom GEOMETRY(Point, 4326),
    pickup_accuracy_meters NUMERIC(6, 2),
    province VARCHAR(50),
    canton VARCHAR(50),
    district VARCHAR(50),
    
    status reservation_status_enum NOT NULL DEFAULT 'requested',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE RESTRICT,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    status trip_status_enum NOT NULL DEFAULT 'created',
    scheduled_start_at TIMESTAMPTZ NOT NULL,
    actual_started_at TIMESTAMPTZ,
    actual_ended_at TIMESTAMPTZ,
    total_distance_meters INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trip_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    stop_sequence INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.trip_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    previous_status trip_status_enum,
    new_status trip_status_enum NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. TELEMETRÍA GPS (ESTRATEGIA SEPARADA: ACTUAL vs HISTÓRICO)
-- ==============================================================================

-- 8.1 UBICACIÓN ACTUAL DEL CONDUCTOR (TABLA LIVIANA PARA MAPA EN VIVO)
CREATE TABLE IF NOT EXISTS public.driver_current_location (
    driver_id UUID PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
    trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy_meters NUMERIC(6, 2) NOT NULL,
    speed_mps NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    heading_degrees NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    is_online BOOLEAN NOT NULL DEFAULT TRUE,
    last_captured_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8.2 HISTÓRICO COMPLETO DE TELEMETRÍA GPS (RECIBIDO POR LOTES DESDE OFFLINE)
CREATE TABLE IF NOT EXISTS public.driver_location_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_event_id VARCHAR(100) NOT NULL UNIQUE, -- Idempotencia estricta
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
    geom GEOMETRY(Point, 4326) NOT NULL,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy_meters NUMERIC(6, 2) NOT NULL,
    speed_mps NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    heading_degrees NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    altitude_meters NUMERIC(7, 2),
    battery_level NUMERIC(3, 2),
    provider VARCHAR(20) NOT NULL DEFAULT 'gps',
    is_mocked BOOLEAN NOT NULL DEFAULT FALSE,
    captured_at TIMESTAMPTZ NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 9. MÉTRICAS CALCULADAS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.driver_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
    total_distance_km NUMERIC(9, 2) NOT NULL DEFAULT 0.0,
    moving_time_seconds INTEGER NOT NULL DEFAULT 0,
    idle_time_seconds INTEGER NOT NULL DEFAULT 0,
    average_speed_kmh NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    max_speed_kmh NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    total_trips_completed INTEGER NOT NULL DEFAULT 0,
    shift_duration_seconds INTEGER NOT NULL DEFAULT 0,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_driver_metric_date UNIQUE (metric_date, driver_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS public.trip_metrics (
    trip_id UUID PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
    distance_km NUMERIC(9, 2) NOT NULL DEFAULT 0.0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    moving_time_seconds INTEGER NOT NULL DEFAULT 0,
    idle_time_seconds INTEGER NOT NULL DEFAULT 0,
    avg_speed_kmh NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    max_speed_kmh NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 10. INCIDENTES, NOTIFICACIONES Y AUDITORÍA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
    trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
    type incident_type_enum NOT NULL,
    severity incident_severity_enum NOT NULL DEFAULT 'medium',
    description TEXT NOT NULL,
    geom GEOMETRY(Point, 4326),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_configuration (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 11. ÍNDICES DE RENDIMIENTO Y ESPACIALES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_reservations_geom ON public.reservations USING GIST (pickup_geom);
CREATE INDEX IF NOT EXISTS idx_reservations_canton ON public.reservations (canton);
CREATE INDEX IF NOT EXISTS idx_reservations_status_date ON public.reservations (status, trip_date);

CREATE INDEX IF NOT EXISTS idx_trips_driver_status ON public.trips (driver_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_scheduled ON public.trips (scheduled_start_at);

CREATE INDEX IF NOT EXISTS idx_driver_current_loc_geom ON public.driver_current_location USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_driver_current_loc_online ON public.driver_current_location (is_online);

CREATE INDEX IF NOT EXISTS idx_driver_loc_history_geom ON public.driver_location_history USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_driver_loc_history_driver_time ON public.driver_location_history (driver_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_loc_history_trip ON public.driver_location_history (trip_id) WHERE trip_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON public.audit_logs (user_id, recorded_at DESC);

-- ==============================================================================
-- 12. FUNCIONES DE SEGURIDAD Y HELPERS RLS
-- ==============================================================================

-- Función para verificar rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.has_role(p_role user_role_type)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = auth.uid() 
          AND role = p_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Función para obtener el driver_id del usuario actual
CREATE OR REPLACE FUNCTION public.get_current_driver_id()
RETURNS UUID AS $$
    SELECT id FROM public.drivers WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==============================================================================
-- 13. POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_vehicle_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_current_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_configuration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 13.1 PROFILES
CREATE POLICY "Usuarios consultan su propio perfil" 
    ON public.profiles FOR SELECT 
    USING (id = auth.uid() OR public.has_role('super_admin') OR public.has_role('dispatcher'));

CREATE POLICY "Usuarios actualizan su propio perfil" 
    ON public.profiles FOR UPDATE 
    USING (id = auth.uid());

-- 13.2 DRIVERS
CREATE POLICY "Administradores y despachadores gestionan conductores"
    ON public.drivers FOR ALL
    USING (public.has_role('super_admin') OR public.has_role('dispatcher') OR public.has_role('analyst'));

CREATE POLICY "Chofer solo consulta su propio registro"
    ON public.drivers FOR SELECT
    USING (user_id = auth.uid());

-- 13.3 VEHICLES
CREATE POLICY "Lectura general de vehículos autenticados"
    ON public.vehicles FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Solo administradores modifican vehículos"
    ON public.vehicles FOR ALL
    USING (public.has_role('super_admin') OR public.has_role('dispatcher'));

-- 13.4 TRIPS
CREATE POLICY "Administradores y analistas ven todos los viajes"
    ON public.trips FOR SELECT
    USING (public.has_role('super_admin') OR public.has_role('dispatcher') OR public.has_role('analyst'));

CREATE POLICY "Chofer solo consulta viajes asignados a él"
    ON public.trips FOR SELECT
    USING (driver_id = public.get_current_driver_id());

CREATE POLICY "Chofer actualiza estado de su viaje activo"
    ON public.trips FOR UPDATE
    USING (driver_id = public.get_current_driver_id());

CREATE POLICY "Administrador gestiona viajes"
    ON public.trips FOR ALL
    USING (public.has_role('super_admin') OR public.has_role('dispatcher'));

-- 13.5 TELEMETRÍA GPS
CREATE POLICY "Admin y despachador ven ubicación en vivo de todos los choferes"
    ON public.driver_current_location FOR SELECT
    USING (public.has_role('super_admin') OR public.has_role('dispatcher') OR public.has_role('analyst'));

CREATE POLICY "Chofer solo actualiza su propia ubicación actual"
    ON public.driver_current_location FOR ALL
    USING (driver_id = public.get_current_driver_id())
    WITH CHECK (driver_id = public.get_current_driver_id());

CREATE POLICY "Admin y analista consultan histórico de ubicaciones"
    ON public.driver_location_history FOR SELECT
    USING (public.has_role('super_admin') OR public.has_role('analyst'));

CREATE POLICY "Chofer inserta lotes de telemetría propia"
    ON public.driver_location_history FOR INSERT
    WITH CHECK (driver_id = public.get_current_driver_id());

-- 13.6 MÉTRICAS (SOLO LECTURA PARA CHOFERES / ANALISTAS)
CREATE POLICY "Chofer consulta solo sus propias métricas calculadas"
    ON public.driver_daily_metrics FOR SELECT
    USING (driver_id = public.get_current_driver_id() OR public.has_role('super_admin') OR public.has_role('analyst') OR public.has_role('dispatcher'));

CREATE POLICY "Nadie modifica métricas directamente excepto funciones backend"
    ON public.driver_daily_metrics FOR INSERT
    WITH CHECK (public.has_role('super_admin'));

-- 13.7 RESERVACIONES (PÚBLICO PUEDE INSERTAR, ADMIN GESTIONA)
CREATE POLICY "Público anónimo puede registrar reservación"
    ON public.reservations FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

CREATE POLICY "Admin y despachadores ven y editan reservaciones"
    ON public.reservations FOR ALL
    USING (public.has_role('super_admin') OR public.has_role('dispatcher') OR public.has_role('analyst'));

-- ==============================================================================
-- 14. FUNCIÓN TRANSACCIONAL DE INGESTA POR LOTE DE GPS (RPC)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.ingest_gps_batch(
    p_samples JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_driver_id UUID;
    v_sample JSONB;
    v_accepted_count INTEGER := 0;
    v_latest_sample JSONB := NULL;
    v_latest_timestamp TIMESTAMPTZ := '1970-01-01'::TIMESTAMPTZ;
BEGIN
    -- Validar que el usuario sea conductor autenticado
    v_driver_id := public.get_current_driver_id();
    IF v_driver_id IS NULL AND NOT public.has_role('super_admin') THEN
        RAISE EXCEPTION 'Acceso denegado: el usuario no tiene perfil de conductor asignado.';
    END IF;

    -- Iterar por cada muestra del lote
    FOR v_sample IN SELECT * FROM jsonb_array_elements(p_samples)
    LOOP
        -- Asegurar que el conductor sea el propietario del lote
        IF v_driver_id IS NOT NULL AND (v_sample->>'driver_id')::UUID != v_driver_id THEN
            CONTINUE; -- Ignorar muestras no pertenecientes a este chofer
        END IF;

        -- Inserción idempotente en el histórico (ON CONFLICT DO NOTHING por device_event_id)
        INSERT INTO public.driver_location_history (
            device_event_id,
            driver_id,
            trip_id,
            vehicle_id,
            geom,
            latitude,
            longitude,
            accuracy_meters,
            speed_mps,
            heading_degrees,
            altitude_meters,
            battery_level,
            provider,
            is_mocked,
            captured_at
        ) VALUES (
            v_sample->>'device_event_id',
            (v_sample->>'driver_id')::UUID,
            (v_sample->>'trip_id')::UUID,
            (v_sample->>'vehicle_id')::UUID,
            ST_SetSRID(ST_MakePoint((v_sample->>'longitude')::DOUBLE PRECISION, (v_sample->>'latitude')::DOUBLE PRECISION), 4326),
            (v_sample->>'latitude')::NUMERIC,
            (v_sample->>'longitude')::NUMERIC,
            (v_sample->>'accuracy_meters')::NUMERIC,
            COALESCE((v_sample->>'speed_mps')::NUMERIC, 0.0),
            COALESCE((v_sample->>'heading_degrees')::NUMERIC, 0.0),
            (v_sample->>'altitude_meters')::NUMERIC,
            (v_sample->>'battery_level')::NUMERIC,
            COALESCE(v_sample->>'provider', 'gps'),
            COALESCE((v_sample->>'is_mocked')::BOOLEAN, FALSE),
            (v_sample->>'captured_at')::TIMESTAMPTZ
        )
        ON CONFLICT (device_event_id) DO NOTHING;

        IF FOUND THEN
            v_accepted_count := v_accepted_count + 1;
        END IF;

        -- Rastrear la muestra más reciente cronológicamente
        IF (v_sample->>'captured_at')::TIMESTAMPTZ > v_latest_timestamp THEN
            v_latest_timestamp := (v_sample->>'captured_at')::TIMESTAMPTZ;
            v_latest_sample := v_sample;
        END IF;
    END LOOP;

    -- Upsert atómico en driver_current_location con la muestra más reciente
    IF v_latest_sample IS NOT NULL THEN
        INSERT INTO public.driver_current_location (
            driver_id,
            vehicle_id,
            trip_id,
            geom,
            latitude,
            longitude,
            accuracy_meters,
            speed_mps,
            heading_degrees,
            is_online,
            last_captured_at,
            updated_at
        ) VALUES (
            (v_latest_sample->>'driver_id')::UUID,
            (v_latest_sample->>'vehicle_id')::UUID,
            (v_latest_sample->>'trip_id')::UUID,
            ST_SetSRID(ST_MakePoint((v_latest_sample->>'longitude')::DOUBLE PRECISION, (v_latest_sample->>'latitude')::DOUBLE PRECISION), 4326),
            (v_latest_sample->>'latitude')::NUMERIC,
            (v_latest_sample->>'longitude')::NUMERIC,
            (v_latest_sample->>'accuracy_meters')::NUMERIC,
            COALESCE((v_latest_sample->>'speed_mps')::NUMERIC, 0.0),
            COALESCE((v_latest_sample->>'heading_degrees')::NUMERIC, 0.0),
            TRUE,
            (v_latest_sample->>'captured_at')::TIMESTAMPTZ,
            NOW()
        )
        ON CONFLICT (driver_id) DO UPDATE SET
            vehicle_id = EXCLUDED.vehicle_id,
            trip_id = EXCLUDED.trip_id,
            geom = EXCLUDED.geom,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            accuracy_meters = EXCLUDED.accuracy_meters,
            speed_mps = EXCLUDED.speed_mps,
            heading_degrees = EXCLUDED.heading_degrees,
            is_online = TRUE,
            last_captured_at = EXCLUDED.last_captured_at,
            updated_at = NOW()
        WHERE EXCLUDED.last_captured_at >= driver_current_location.last_captured_at;
    END IF;

    RETURN jsonb_build_object(
        'accepted_count', v_accepted_count,
        'latest_captured_at', v_latest_timestamp
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 15. TRIGGER AUTOMÁTICO: SINCRONIZAR AUTH.USERS CON PUBLIC.PROFILES
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario Registrado'),
        COALESCE(NEW.raw_user_meta_data->>'phone', '')
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
