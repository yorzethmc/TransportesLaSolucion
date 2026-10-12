-- ==============================================================================
-- MIGRACIÓN V1.2: REGLAS GPS CON QUALITY_FLAG, RELEVOS, CRON Y CONCURRENCIA
-- Transportes La Solución - V1.2
-- ==============================================================================

-- 1. Agregar quality_flag a la telemetría histórica
ALTER TABLE public.driver_location_history 
ADD COLUMN IF NOT EXISTS quality_flag VARCHAR(50) DEFAULT 'valid';

CREATE INDEX IF NOT EXISTS idx_driver_location_history_quality 
ON public.driver_location_history (quality_flag);

-- 2. Asegurar columnas de relevo en driver_location_history
ALTER TABLE public.driver_location_history
ADD COLUMN IF NOT EXISTS relay_hop_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS relay_signature TEXT DEFAULT NULL;

-- 3. Función segura y concurrente para generación de número de solicitud TLS-YYYYMMDD-0001
CREATE OR REPLACE FUNCTION public.generate_next_request_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_date_str TEXT;
    v_prefix TEXT;
    v_seq INTEGER;
    v_next_num TEXT;
BEGIN
    -- Bloqueo consultivo por fecha para garantizar concurrencia estricta
    v_date_str := to_char(NOW() AT TIME ZONE 'America/Costa_Rica', 'YYYYMMDD');
    v_prefix := 'TLS-' || v_date_str || '-';

    -- Obtener el conteo actual o el máximo sufijo numérico para el día de hoy
    SELECT COALESCE(MAX(SUBSTRING(request_number FROM 14 FOR 4)::INTEGER), 0) + 1
    INTO v_seq
    FROM public.transport_requests
    WHERE request_number LIKE (v_prefix || '%');

    v_next_num := v_prefix || LPAD(v_seq::TEXT, 4, '0');
    RETURN v_next_num;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_request_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_request_number() TO authenticated, anon;

-- Trigger para asignar automáticamente request_number si no viene definido
CREATE OR REPLACE FUNCTION public.trg_assign_request_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF NEW.request_number IS NULL OR NEW.request_number = '' THEN
        NEW.request_number := public.generate_next_request_number();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_request_number ON public.transport_requests;
CREATE TRIGGER trg_set_request_number
BEFORE INSERT ON public.transport_requests
FOR EACH ROW
EXECUTE FUNCTION public.trg_assign_request_number();

-- 4. RPC AJUSTADA: ingest_gps_batch_v2 CON REGLAS DE QUALITY_FLAG Y VALIDACIONES ESTRICTAS
CREATE OR REPLACE FUNCTION public.ingest_gps_batch_v2(
    p_samples JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
    v_current_driver_id UUID;
    v_is_admin BOOLEAN;
    v_sample JSONB;
    v_accepted_count INTEGER := 0;
    v_duplicate_count INTEGER := 0;
    v_rejected_count INTEGER := 0;
    v_rejected_events JSONB := '[]'::JSONB;
    v_latest_timestamp TIMESTAMPTZ := '1970-01-01'::TIMESTAMPTZ;
    v_latest_sample JSONB := NULL;
    
    -- Variables por evento
    v_evt_id VARCHAR(100);
    v_sample_driver_id UUID;
    v_device_id_raw TEXT;
    v_device_uuid UUID;
    v_device_record RECORD;
    v_driver_record RECORD;
    v_lat NUMERIC;
    v_lng NUMERIC;
    v_accuracy NUMERIC;
    v_speed NUMERIC;
    v_heading NUMERIC;
    v_altitude NUMERIC;
    v_battery NUMERIC;
    v_captured_at TIMESTAMPTZ;
    v_quality_flag VARCHAR(50);
    v_hop_count INTEGER;
    v_signature TEXT;
    v_existing_id UUID;
BEGIN
    -- Validar autenticación
    v_current_driver_id := public.get_current_driver_id();
    v_is_admin := public.is_admin();

    IF v_current_driver_id IS NULL AND NOT v_is_admin THEN
        RETURN jsonb_build_object(
            'accepted_count', 0,
            'duplicate_count', 0,
            'rejected_count', COALESCE(jsonb_array_length(p_samples), 0),
            'rejected_events', jsonb_build_array(jsonb_build_object('reason_code', 'AUTH_FORBIDDEN', 'message', 'Conductor inactivo o no autorizado')),
            'latest_captured_at', NULL
        );
    END IF;

    -- Validar tamaño de lote
    IF p_samples IS NULL OR jsonb_typeof(p_samples) != 'array' THEN
        RETURN jsonb_build_object(
            'accepted_count', 0,
            'duplicate_count', 0,
            'rejected_count', 1,
            'rejected_events', jsonb_build_array(jsonb_build_object('reason_code', 'MALFORMED_PAYLOAD', 'message', 'Payload debe ser un arreglo JSON')),
            'latest_captured_at', NULL
        );
    END IF;

    IF jsonb_array_length(p_samples) > 200 THEN
        RAISE EXCEPTION 'Tamaño de lote excedido: máximo 200 eventos por transmisión.';
    END IF;

    -- Iterar sobre muestras
    FOR v_sample IN SELECT * FROM jsonb_array_elements(p_samples)
    LOOP
        v_evt_id := v_sample->>'device_event_id';
        v_sample_driver_id := NULLIF(v_sample->>'driver_id', '')::UUID;
        v_device_id_raw := NULLIF(v_sample->>'device_id', '');
        v_lat := NULLIF(v_sample->>'latitude', '')::NUMERIC;
        v_lng := NULLIF(v_sample->>'longitude', '')::NUMERIC;
        v_accuracy := NULLIF(v_sample->>'accuracy_meters', '')::NUMERIC;
        v_speed := COALESCE(NULLIF(v_sample->>'speed_mps', '')::NUMERIC, 0.0);
        v_heading := NULLIF(v_sample->>'heading_degrees', '')::NUMERIC;
        v_altitude := NULLIF(v_sample->>'altitude_meters', '')::NUMERIC;
        v_battery := NULLIF(v_sample->>'battery_level', '')::NUMERIC;
        v_captured_at := NULLIF(v_sample->>'captured_at', '')::TIMESTAMPTZ;
        v_hop_count := COALESCE(NULLIF(v_sample->>'hop_count', '')::INTEGER, 0);
        v_signature := NULLIF(v_sample->>'signature', '');

        -- 1. device_event_id obligatorio
        IF v_evt_id IS NULL OR length(trim(v_evt_id)) < 5 THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', COALESCE(v_evt_id, 'UNKNOWN'), 'reason_code', 'INVALID_EVENT_ID');
            CONTINUE;
        END IF;

        -- 2. Verificar duplicado en histórico
        SELECT id INTO v_existing_id 
        FROM public.driver_location_history 
        WHERE device_event_id = v_evt_id 
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            v_duplicate_count := v_duplicate_count + 1;
            CONTINUE;
        END IF;

        -- 3. Validación de conductor: no suplantar a otro conductor
        IF NOT v_is_admin AND v_sample_driver_id != v_current_driver_id THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'DRIVER_MISMATCH');
            CONTINUE;
        END IF;

        -- 4. Validar que el conductor esté ACTIVO
        SELECT active INTO v_driver_record 
        FROM public.drivers 
        WHERE id = v_sample_driver_id;

        IF v_driver_record.active IS NOT TRUE THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'DRIVER_INACTIVE');
            CONTINUE;
        END IF;

        -- 5. Validar estado del dispositivo si fue provisto
        IF v_device_id_raw IS NOT NULL THEN
            -- Buscar en driver_devices
            SELECT active, revoked_at, public_key INTO v_device_record
            FROM public.driver_devices
            WHERE (id::TEXT = v_device_id_raw OR device_id = v_device_id_raw)
              AND driver_id = v_sample_driver_id
            LIMIT 1;

            IF FOUND THEN
                IF v_device_record.revoked_at IS NOT NULL OR v_device_record.active IS FALSE THEN
                    v_rejected_count := v_rejected_count + 1;
                    v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'DEVICE_REVOKED');
                    CONTINUE;
                END IF;
            END IF;
        END IF;

        -- 6. Validación de relevo (hop_count <= 2)
        IF v_hop_count > 2 THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'HOP_LIMIT_EXCEEDED');
            CONTINUE;
        END IF;

        -- 7. Validación de coordenadas obligatorias y rangos mundiales
        IF v_lat IS NULL OR v_lat < -90 OR v_lat > 90 OR v_lng IS NULL OR v_lng < -180 OR v_lng > 180 THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'INVALID_COORDINATES');
            CONTINUE;
        END IF;

        -- 8. Validación de timestamp: no en el futuro (> 5 min) y no más de 7 días de antigüedad
        IF v_captured_at IS NULL OR v_captured_at > (NOW() + INTERVAL '5 minutes') OR v_captured_at < (NOW() - INTERVAL '7 days') THEN
            v_rejected_count := v_rejected_count + 1;
            v_rejected_events := v_rejected_events || jsonb_build_object('device_event_id', v_evt_id, 'reason_code', 'TIMESTAMP_OUT_OF_WINDOW');
            CONTINUE;
        END IF;

        -- 9. APLICACIÓN DE QUALITY_FLAG:
        -- Puntos con baja precisión o velocidad imposible NO se rechazan; se guardan con flag
        v_quality_flag := 'valid';
        IF v_accuracy IS NULL OR v_accuracy < 0 OR v_accuracy > 150 THEN
            v_quality_flag := 'low_accuracy';
        ELSIF v_speed < 0 OR v_speed > 45 THEN
            v_quality_flag := 'implausible_speed';
        END IF;

        -- Inserción en histórico
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
            captured_at,
            quality_flag,
            relay_hop_count,
            relay_signature
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
            v_heading,
            v_altitude,
            v_battery,
            COALESCE(v_sample->>'provider', 'fused'),
            COALESCE((v_sample->>'is_mocked')::BOOLEAN, FALSE),
            v_captured_at,
            v_quality_flag,
            v_hop_count,
            v_signature
        );

        v_accepted_count := v_accepted_count + 1;

        -- Actualizar último timestamp para ubicación actual SOLO SI ES VÁLIDO
        IF v_quality_flag = 'valid' AND v_captured_at > v_latest_timestamp THEN
            v_latest_timestamp := v_captured_at;
            v_latest_sample := v_sample;
        END IF;
    END LOOP;

    -- 10. Actualizar driver_current_location con la muestra válida más reciente
    IF v_latest_sample IS NOT NULL THEN
        INSERT INTO public.driver_current_location (
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
            captured_at,
            updated_at
        ) VALUES (
            NULLIF(v_latest_sample->>'driver_id', '')::UUID,
            NULLIF(v_latest_sample->>'trip_id', '')::UUID,
            NULLIF(v_latest_sample->>'vehicle_id', '')::UUID,
            ST_SetSRID(ST_MakePoint(
                (v_latest_sample->>'longitude')::DOUBLE PRECISION,
                (v_latest_sample->>'latitude')::DOUBLE PRECISION
            ), 4326),
            (v_latest_sample->>'latitude')::NUMERIC,
            (v_latest_sample->>'longitude')::NUMERIC,
            NULLIF(v_latest_sample->>'accuracy_meters', '')::NUMERIC,
            COALESCE(NULLIF(v_latest_sample->>'speed_mps', '')::NUMERIC, 0.0),
            NULLIF(v_latest_sample->>'heading_degrees', '')::NUMERIC,
            NULLIF(v_latest_sample->>'altitude_meters', '')::NUMERIC,
            NULLIF(v_latest_sample->>'battery_level', '')::NUMERIC,
            (v_latest_sample->>'captured_at')::TIMESTAMPTZ,
            NOW()
        )
        ON CONFLICT (driver_id) DO UPDATE SET
            trip_id = EXCLUDED.trip_id,
            vehicle_id = EXCLUDED.vehicle_id,
            geom = EXCLUDED.geom,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            accuracy_meters = EXCLUDED.accuracy_meters,
            speed_mps = EXCLUDED.speed_mps,
            heading_degrees = EXCLUDED.heading_degrees,
            altitude_meters = EXCLUDED.altitude_meters,
            battery_level = EXCLUDED.battery_level,
            captured_at = EXCLUDED.captured_at,
            updated_at = NOW()
        WHERE EXCLUDED.captured_at >= public.driver_current_location.captured_at;
    END IF;

    RETURN jsonb_build_object(
        'accepted_count', v_accepted_count,
        'duplicate_count', v_duplicate_count,
        'rejected_count', v_rejected_count,
        'rejected_events', v_rejected_events,
        'latest_captured_at', CASE WHEN v_latest_sample IS NOT NULL THEN v_latest_timestamp ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_gps_batch_v2(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_gps_batch_v2(JSONB) TO authenticated;

-- 5. AJUSTAR CÁLCULO DE MÉTRICAS PARA EXCLUIR QUALITY_FLAG != 'valid'
CREATE OR REPLACE FUNCTION public.calculate_trip_metrics_v2(
    p_trip_id UUID
)
RETURNS TABLE (
    total_distance_km NUMERIC,
    avg_speed_kmh NUMERIC,
    max_speed_kmh NUMERIC,
    points_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    WITH valid_points AS (
        SELECT 
            geom,
            speed_mps,
            captured_at,
            LAG(geom) OVER (ORDER BY captured_at) as prev_geom
        FROM public.driver_location_history
        WHERE trip_id = p_trip_id
          AND quality_flag = 'valid'
    )
    SELECT
        COALESCE(ROUND((SUM(ST_Distance(geom::geography, prev_geom::geography)) / 1000.0)::NUMERIC, 2), 0.0) AS total_distance_km,
        COALESCE(ROUND((AVG(speed_mps) * 3.6)::NUMERIC, 2), 0.0) AS avg_speed_kmh,
        COALESCE(ROUND((MAX(speed_mps) * 3.6)::NUMERIC, 2), 0.0) AS max_speed_kmh,
        COUNT(*)::INTEGER AS points_count
    FROM valid_points;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_trip_metrics_v2(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_trip_metrics_v2(UUID) TO authenticated;

-- 6. PROGRAMACIÓN MENSUAL CON PG_CRON (Si está disponible en el entorno)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Programar consolidación y purga el primer día de cada mes a las 03:00 UTC
        PERFORM cron.unschedule('tls_monthly_purge_job');
        PERFORM cron.schedule(
            'tls_monthly_purge_job',
            '0 3 1 * *',
            'SELECT public.consolidate_and_purge_monthly((CURRENT_DATE - INTERVAL ''1 month'')::DATE);'
        );
        RAISE NOTICE 'pg_cron job tls_monthly_purge_job programado exitosamente.';
    ELSE
        RAISE NOTICE 'pg_cron no disponible en este entorno; el trabajo cron puede activarse manualmente o vía webhook externo.';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Aviso sobre pg_cron: % (omitiendo registro automático)', SQLERRM;
END $$;

-- 7. POLÍTICA RLS PARA LECTURA PÚBLICA DE APP_CONFIGURATION
DROP POLICY IF EXISTS "Lectura pública de configuraciones no sensibles" ON public.app_configuration;
CREATE POLICY "Lectura pública de configuraciones no sensibles"
ON public.app_configuration FOR SELECT
TO anon, authenticated
USING (key IN ('company_whatsapp', 'company_phone', 'support_whatsapp', 'company_name', 'enable_device_relay'));

-- Feature flag desactivado por defecto
INSERT INTO public.app_configuration (key, value, description)
VALUES ('enable_device_relay', 'false'::jsonb, 'Feature flag de relevo experimental P2P entre choferes (Desactivado por defecto en V1.2)')
ON CONFLICT (key) DO NOTHING;


