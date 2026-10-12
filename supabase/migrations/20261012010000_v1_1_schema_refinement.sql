-- ==============================================================================
-- TRANSPORTES LA SOLUCIÓN - V1.1 MIGRACIÓN INCREMENTAL DE REFINAMIENTO Y BLINDAJE
-- Fecha: 2026-10-12
-- Stack: PostgreSQL 15+ / PostGIS / Supabase Auth
-- Objetivo: Simplificación de roles (admin, driver), autenticación telefónica,
--           solicitudes persistentes, relay entre dispositivos y purgado mensual.
-- ==============================================================================

-- 1. EXTENSIÓN Y ADAPTACIÓN DE ROLES
-- Insertar rol 'admin' si la tabla roles usa texto o enum flexible
DO $$ BEGIN
    ALTER TYPE user_role_type ADD VALUE IF NOT EXISTS 'admin';
EXCEPTION WHEN undefined_object THEN null; END $$;

-- Asegurar tabla de roles con admin y driver
INSERT INTO public.roles (name, description) VALUES
    ('admin', 'Administrador total de operaciones, flota y despacho'),
    ('driver', 'Conductor autorizado de unidad')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- Migrar roles antiguos a 'admin'
UPDATE public.user_roles 
SET role = 'admin' 
WHERE role::text IN ('super_admin', 'dispatcher', 'analyst');

-- Eliminar roles deprecados
DELETE FROM public.roles WHERE name::text IN ('super_admin', 'dispatcher', 'analyst');

-- 2. AJUSTES EN TABLA DRIVERS (AUTENTICACIÓN TELEFÓNICA Y SEGURIDAD)
ALTER TABLE public.drivers 
    ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
    ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20),
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Normalizar datos existentes si los hay
UPDATE public.drivers 
SET phone_number = regexp_replace(phone, '\D', '', 'g')
WHERE phone_number IS NULL AND phone IS NOT NULL;

-- Restricción única en número telefónico
DO $$ BEGIN
    ALTER TABLE public.drivers ADD CONSTRAINT uq_driver_phone_number UNIQUE (phone_number);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null; END $$;

-- 3. FUNCIONES DE SEGURIDAD RLS ACTUALIZADAS
CREATE OR REPLACE FUNCTION public.has_role(p_role text)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_roles 
        WHERE user_id = auth.uid() 
          AND role::text = p_role
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, auth;

REVOKE ALL ON FUNCTION public.has_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.has_role('admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, auth;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_driver_id()
RETURNS UUID AS $$
    SELECT id FROM public.drivers WHERE user_id = auth.uid() AND active = TRUE;
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, auth;

REVOKE ALL ON FUNCTION public.get_current_driver_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_driver_id() TO authenticated;

-- ==============================================================================
-- 4. TABLA DE SOLICITUDES PÚBLICAS (TRANSPORT_REQUESTS)
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE transport_request_status AS ENUM (
        'new', 'whatsapp_opened', 'reviewed', 'accepted', 'rejected', 'converted_to_trip', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.transport_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number VARCHAR(30) NOT NULL UNIQUE, -- Formato: TLS-YYYYMMDD-0001
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(25) NOT NULL,
    customer_whatsapp VARCHAR(25),
    trip_date DATE NOT NULL,
    trip_time TIME,
    origin_address TEXT NOT NULL,
    destination_address TEXT NOT NULL,
    adults_count SMALLINT NOT NULL DEFAULT 1 CHECK (adults_count >= 1),
    minors_count SMALLINT NOT NULL DEFAULT 0 CHECK (minors_count >= 0),
    has_luggage BOOLEAN NOT NULL DEFAULT FALSE,
    special_notes TEXT,
    
    -- Ubicación satelital de recogida (opcional)
    pickup_geom GEOMETRY(Point, 4326),
    pickup_latitude NUMERIC(10, 7),
    pickup_longitude NUMERIC(10, 7),
    pickup_accuracy_meters NUMERIC(6, 2),
    pickup_canton VARCHAR(50),
    pickup_district VARCHAR(50),
    
    status transport_request_status NOT NULL DEFAULT 'new',
    whatsapp_opened_at TIMESTAMPTZ,
    converted_trip_id UUID,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.request_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.transport_requests(id) ON DELETE CASCADE,
    previous_status transport_request_status,
    new_status transport_request_status NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_status_date ON public.transport_requests(status, trip_date);
CREATE INDEX IF NOT EXISTS idx_requests_number ON public.transport_requests(request_number);
CREATE INDEX IF NOT EXISTS idx_requests_phone ON public.transport_requests(customer_phone);

-- ==============================================================================
-- 5. SECUENCIA AUTOMÁTICA DE NÚMERO DE SOLICITUD (TLS-YYYYMMDD-0001)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.generate_request_number()
RETURNS TRIGGER AS $$
DECLARE
    v_prefix VARCHAR(15);
    v_seq_num INTEGER;
BEGIN
    v_prefix := 'TLS-' || to_char(NOW(), 'YYYYMMDD') || '-';
    
    SELECT COALESCE(MAX(SUBSTRING(request_number FROM 14)::INTEGER), 0) + 1
    INTO v_seq_num
    FROM public.transport_requests
    WHERE request_number LIKE v_prefix || '%';
    
    NEW.request_number := v_prefix || lpad(v_seq_num::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS trg_assign_request_number ON public.transport_requests;
CREATE TRIGGER trg_assign_request_number
    BEFORE INSERT ON public.transport_requests
    FOR EACH ROW
    WHEN (NEW.request_number IS NULL OR NEW.request_number = '')
    EXECUTE FUNCTION public.generate_request_number();

-- ==============================================================================
-- 6. DISPOSITIVOS AUTORIZADOS Y MÓDULO EXPERIMENTAL DE RELAY ENTRE DISPOSITIVOS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.device_relay_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_device_id VARCHAR(100) NOT NULL,
    relay_device_id VARCHAR(100) NOT NULL,
    device_event_id VARCHAR(100) NOT NULL,
    payload_encrypted TEXT NOT NULL,
    signature VARCHAR(255) NOT NULL,
    hop_count SMALLINT NOT NULL DEFAULT 1 CHECK (hop_count <= 2),
    status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'rejected')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.synchronization_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    device_id VARCHAR(100) NOT NULL,
    events_count INTEGER NOT NULL,
    success_count INTEGER NOT NULL,
    error_message TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 7. MÉTRICAS MENSUALES Y REGISTRO DE BORRADO (PURGE)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.driver_monthly_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_month DATE NOT NULL, -- Primer día del mes (YYYY-MM-01)
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    total_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    total_trips_completed INTEGER NOT NULL DEFAULT 0,
    total_moving_time_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    total_idle_time_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    average_speed_kmh NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    max_speed_kmh NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    incidents_count SMALLINT NOT NULL DEFAULT 0,
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_driver_monthly_metric UNIQUE (metric_month, driver_id)
);

CREATE TABLE IF NOT EXISTS public.vehicle_monthly_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_month DATE NOT NULL,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    total_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
    total_trips_completed INTEGER NOT NULL DEFAULT 0,
    total_hours_in_service NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_vehicle_monthly_metric UNIQUE (metric_month, vehicle_id)
);

CREATE TABLE IF NOT EXISTS public.purge_execution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_closed_date DATE NOT NULL,
    records_deleted_location_history BIGINT NOT NULL DEFAULT 0,
    records_deleted_relay_events BIGINT NOT NULL DEFAULT 0,
    records_deleted_sync_attempts BIGINT NOT NULL DEFAULT 0,
    executed_by VARCHAR(50) NOT NULL DEFAULT 'system_cron',
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'aborted')),
    details TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. RPC BLINDADA DE INGESTA POR LOTE DE GPS CON NULLIF Y CÓDIGOS DE ERROR
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.ingest_gps_batch_v2(
    p_samples JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_driver_id UUID;
    v_sample JSONB;
    v_accepted_count INTEGER := 0;
    v_duplicate_count INTEGER := 0;
    v_rejected_count INTEGER := 0;
    v_rejected_events JSONB := '[]'::JSONB;
    v_latest_sample JSONB := NULL;
    v_latest_timestamp TIMESTAMPTZ := '1970-01-01'::TIMESTAMPTZ;
    
    -- Variables temporales de extracción
    v_evt_id VARCHAR(100);
    v_sample_driver_id UUID;
    v_lat NUMERIC;
    v_lng NUMERIC;
    v_accuracy NUMERIC;
    v_speed NUMERIC;
    v_captured_at TIMESTAMPTZ;
BEGIN
    -- 1. Validar autenticación y rol de conductor
    v_driver_id := public.get_current_driver_id();
    IF v_driver_id IS NULL AND NOT public.is_admin() THEN
        RETURN jsonb_build_object(
            'accepted_count', 0,
            'duplicate_count', 0,
            'rejected_count', jsonb_array_length(p_samples),
            'rejected_events', jsonb_build_array(jsonb_build_object('reason_code', 'AUTH_FORBIDDEN', 'message', 'Conductor inactivo o no autorizado')),
            'latest_captured_at', NULL
        );
    END IF;

    -- Límite de seguridad: máximo 200 eventos por lote
    IF jsonb_array_length(p_samples) > 200 THEN
        RAISE EXCEPTION 'Tamaño de lote excedido: máximo 200 eventos por transmisión.';
    END IF;

    -- 2. Procesar cada evento de telemetría
    FOR v_sample IN SELECT * FROM jsonb_array_elements(p_samples)
    LOOP
        v_evt_id := v_sample->>'device_event_id';
        v_sample_driver_id := NULLIF(v_sample->>'driver_id', '')::UUID;
        v_lat := NULLIF(v_sample->>'latitude', '')::NUMERIC;
        v_lng := NULLIF(v_sample->>'longitude', '')::NUMERIC;
        v_accuracy := NULLIF(v_sample->>'accuracy_meters', '')::NUMERIC;
        v_speed := COALESCE(NULLIF(v_sample->>'speed_mps', '')::NUMERIC, 0.0);
        v_captured_at := NULLIF(v_sample->>'captured_at', '')::TIMESTAMPTZ;

        -- Validación: device_event_id obligatorio
        IF v_evt_id IS NULL OR length(v_evt_id) < 5 THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', 'UNKNOWN', 'reason_code', 'INVALID_EVENT_ID');
            CONTINUE;
        END IF;

        -- Validación: propietario del evento (no suplantar a otro conductor)
        IF v_driver_id IS NOT NULL AND v_sample_driver_id != v_driver_id THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'DRIVER_MISMATCH');
            CONTINUE;
        END IF;

        -- Validación: rango de coordenadas geográficas
        IF v_lat IS NULL OR v_lat < -90 OR v_lat > 90 OR v_lng IS NULL OR v_lng < -180 OR v_lng > 180 THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'INVALID_COORDINATES');
            CONTINUE;
        END IF;

        -- Validación: precisión dentro de rango tolerable (máximo 50m)
        IF v_accuracy IS NULL OR v_accuracy < 0 OR v_accuracy > 150 THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'ACCURACY_EXCEEDED');
            CONTINUE;
        END IF;

        -- Validación: velocidad físicamente posible (< 45 m/s = 162 km/h)
        IF v_speed < 0 OR v_speed > 45 THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'IMPLAUSIBLE_SPEED');
            CONTINUE;
        END IF;

        -- Validación: timestamp no en el futuro (> 5 min de desvío de reloj)
        IF v_captured_at IS NULL OR v_captured_at > (NOW() + INTERVAL '5 minutes') THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'FUTURE_TIMESTAMP');
            CONTINUE;
        END IF;

        -- Inserción idempotente en histórico
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
            v_evt_id,
            v_sample_driver_id,
            NULLIF(v_sample->>'trip_id', '')::UUID,
            NULLIF(v_sample->>'vehicle_id', '')::UUID,
            ST_SetSRID(ST_MakePoint(v_lng::DOUBLE PRECISION, v_lat::DOUBLE PRECISION), 4326),
            v_lat,
            v_lng,
            v_accuracy,
            v_speed,
            COALESCE(NULLIF(v_sample->>'heading_degrees', '')::NUMERIC, 0.0),
            NULLIF(v_sample->>'altitude_meters', '')::NUMERIC,
            NULLIF(v_sample->>'battery_level', '')::NUMERIC,
            COALESCE(v_sample->>'provider', 'gps'),
            COALESCE((v_sample->>'is_mocked')::BOOLEAN, FALSE),
            v_captured_at
        )
        ON CONFLICT (device_event_id) DO NOTHING;

        IF FOUND THEN
            v_accepted_count := v_accepted_count + 1;
            IF v_captured_at > v_latest_timestamp THEN
                v_latest_timestamp := v_captured_at;
                v_latest_sample := v_sample;
            END IF;
        ELSE
            v_duplicate_count := v_duplicate_count + 1;
        END IF;
    END LOOP;

    -- Upsert de la posición más reciente en driver_current_location
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
            NULLIF(v_latest_sample->>'driver_id', '')::UUID,
            NULLIF(v_latest_sample->>'vehicle_id', '')::UUID,
            NULLIF(v_latest_sample->>'trip_id', '')::UUID,
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
        'duplicate_count', v_duplicate_count,
        'rejected_count', v_rejected_count,
        'rejected_events', v_rejected_events,
        'latest_captured_at', CASE WHEN v_latest_timestamp > '1970-01-01'::TIMESTAMPTZ THEN v_latest_timestamp ELSE NULL END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth;

REVOKE ALL ON FUNCTION public.ingest_gps_batch_v2(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_gps_batch_v2(JSONB) TO authenticated;

-- ==============================================================================
-- 9. PROCEDIMIENTO ALMACENADO DE CONSOLIDACIÓN Y PURGADO MENSUAL SEGURO
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.consolidate_and_purge_monthly(
    p_closed_month DATE -- Primer día del mes cerrado a purgar, ej: '2026-09-01'
)
RETURNS JSONB AS $$
DECLARE
    v_month_start DATE := date_trunc('month', p_closed_month)::DATE;
    v_month_end DATE := (date_trunc('month', p_closed_month) + INTERVAL '1 month')::DATE;
    v_deleted_locs BIGINT := 0;
    v_deleted_relays BIGINT := 0;
    v_deleted_syncs BIGINT := 0;
    v_checksum VARCHAR(64);
BEGIN
    -- 1. Validar que el mes esté efectivamente cerrado (no purgar el mes en curso)
    IF v_month_end > CURRENT_DATE THEN
        RAISE EXCEPTION 'Abortado: el periodo % aún no ha concluido.', v_month_start;
    END IF;

    -- 2. Consolidar métricas mensuales de conductores si no existen
    INSERT INTO public.driver_monthly_metrics (
        metric_month,
        driver_id,
        total_distance_km,
        total_trips_completed,
        total_moving_time_hours,
        total_idle_time_hours,
        average_speed_kmh,
        max_speed_kmh,
        incidents_count,
        checksum
    )
    SELECT
        v_month_start,
        m.driver_id,
        COALESCE(SUM(m.total_distance_km), 0.0),
        COALESCE(SUM(m.total_trips_completed), 0)::INTEGER,
        ROUND((COALESCE(SUM(m.moving_time_seconds), 0) / 3600.0)::NUMERIC, 2),
        ROUND((COALESCE(SUM(m.idle_time_seconds), 0) / 3600.0)::NUMERIC, 2),
        ROUND(COALESCE(AVG(NULLIF(m.average_speed_kmh, 0)), 0.0)::NUMERIC, 2),
        COALESCE(MAX(m.max_speed_kmh), 0.0),
        COALESCE((SELECT COUNT(*) FROM public.incidents i WHERE i.driver_id = m.driver_id AND i.reported_at >= v_month_start AND i.reported_at < v_month_end), 0)::SMALLINT,
        md5(m.driver_id::TEXT || v_month_start::TEXT || SUM(m.total_distance_km)::TEXT)
    FROM public.driver_daily_metrics m
    WHERE m.metric_date >= v_month_start AND m.metric_date < v_month_end
    GROUP BY m.driver_id
    ON CONFLICT (metric_month, driver_id) DO NOTHING;

    -- 3. Ejecutar borrado seguro de telemetría cruda del periodo cerrado
    WITH deleted_loc AS (
        DELETE FROM public.driver_location_history
        WHERE captured_at >= v_month_start AND captured_at < v_month_end
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_locs FROM deleted_loc;

    WITH deleted_rel AS (
        DELETE FROM public.device_relay_events
        WHERE received_at >= v_month_start AND received_at < v_month_end
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_relays FROM deleted_rel;

    WITH deleted_syn AS (
        DELETE FROM public.synchronization_attempts
        WHERE attempted_at >= v_month_start AND attempted_at < v_month_end
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_syncs FROM deleted_syn;

    -- 4. Registrar en la bitácora de purgado
    INSERT INTO public.purge_execution_log (
        period_closed_date,
        records_deleted_location_history,
        records_deleted_relay_events,
        records_deleted_sync_attempts,
        executed_by,
        status,
        details
    ) VALUES (
        v_month_start,
        v_deleted_locs,
        v_deleted_relays,
        v_deleted_syncs,
        'monthly_maintenance_job',
        'success',
        format('Periodo %s cerrado exitosamente. Telemetría cruda eliminada tras consolidar métricas.', v_month_start)
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'period_closed', v_month_start,
        'deleted_location_records', v_deleted_locs,
        'deleted_relay_records', v_deleted_relays,
        'deleted_sync_records', v_deleted_syncs
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.consolidate_and_purge_monthly(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consolidate_and_purge_monthly(DATE) TO authenticated;

-- ==============================================================================
-- 10. POLÍTICAS RLS ACTUALIZADAS PARA TRANSPORT_REQUESTS
-- ==============================================================================

ALTER TABLE public.transport_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_relay_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.synchronization_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_monthly_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_monthly_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purge_execution_log ENABLE ROW LEVEL SECURITY;

-- Solicitudes: Inserción pública abierta para clientes
CREATE POLICY "Publico anonimo crea solicitudes de transporte"
    ON public.transport_requests FOR INSERT
    TO anon, authenticated
    WITH CHECK (TRUE);

-- Solicitudes: Solo administradores pueden ver, editar y listar
CREATE POLICY "Admin gestiona solicitudes de transporte"
    ON public.transport_requests FOR ALL
    TO authenticated
    USING (public.is_admin());

-- Relay y sync: Conductores autenticados insertan sus eventos
CREATE POLICY "Chofer registra eventos de relay recibidos"
    ON public.device_relay_events FOR INSERT
    TO authenticated
    WITH CHECK (TRUE);

CREATE POLICY "Chofer registra intentos de sincronizacion"
    ON public.synchronization_attempts FOR INSERT
    TO authenticated
    WITH CHECK (driver_id = public.get_current_driver_id());

-- Métricas mensuales: Chofer consulta las suyas, Admin consulta todas
CREATE POLICY "Chofer lee sus metricas mensuales"
    ON public.driver_monthly_metrics FOR SELECT
    TO authenticated
    USING (driver_id = public.get_current_driver_id() OR public.is_admin());

CREATE POLICY "Admin lee metricas mensuales de vehiculos"
    ON public.vehicle_monthly_metrics FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admin consulta bitacora de purgado"
    ON public.purge_execution_log FOR SELECT
    TO authenticated
    USING (public.is_admin());
