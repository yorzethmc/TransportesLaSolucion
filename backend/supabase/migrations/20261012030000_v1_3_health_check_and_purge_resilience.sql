-- ==============================================================================
-- MIGRACIÓN V1.3: HEALTH CHECK RPC & PURGA RESILIENTE ANTE PAUSAS
-- ==============================================================================

-- 1. Añadir columna is_delayed a purge_execution_log si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'purge_execution_log' 
          AND column_name = 'is_delayed'
    ) THEN
        ALTER TABLE public.purge_execution_log 
        ADD COLUMN is_delayed BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

-- Actualizar restricción de status si es necesario
ALTER TABLE public.purge_execution_log 
DROP CONSTRAINT IF EXISTS purge_execution_log_status_check;

ALTER TABLE public.purge_execution_log 
ADD CONSTRAINT purge_execution_log_status_check 
CHECK (status IN ('success', 'failed', 'aborted', 'delayed_success'));

-- 2. RPC DE HEALTH CHECK DE SOLO LECTURA (Cero exposición de datos sensibles)
-- Diseñada para keep-alive contra suspensión del plan gratuito de Supabase
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', 'healthy',
    'timestamp', now(),
    'version', '1.3.0',
    'service', 'Transportes La Solución'
  );
$$;

COMMENT ON FUNCTION public.health_check() IS 
'RPC de solo lectura para monitoreo de disponibilidad y keep-alive del plan free.';

-- Permisos públicos para health_check (invocable con Publishable Key)
GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated, service_role;

-- 3. FUNCIÓN DE PURGA RESILIENTE ANTE PERIODOS CERRADOS ACUMULADOS
CREATE OR REPLACE FUNCTION public.consolidate_and_purge_monthly(
    p_closed_month DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_target_month DATE;
    v_month_start DATE;
    v_month_end DATE;
    v_is_delayed BOOLEAN := FALSE;
    v_deleted_locs BIGINT := 0;
    v_deleted_relays BIGINT := 0;
    v_deleted_syncs BIGINT := 0;
    v_months_processed JSONB := '[]'::JSONB;
    v_period_record RECORD;
    v_standard_expected_month DATE := date_trunc('month', CURRENT_DATE - INTERVAL '1 month')::DATE;
BEGIN
    -- Si se pasa un mes específico, procesar únicamente ese mes
    IF p_closed_month IS NOT NULL THEN
        v_month_start := date_trunc('month', p_closed_month)::DATE;
        v_month_end := (v_month_start + INTERVAL '1 month')::DATE;

        IF v_month_end > CURRENT_DATE THEN
            RAISE EXCEPTION 'Abortado: el periodo % aún no ha concluido.', v_month_start;
        END IF;

        IF v_month_start < v_standard_expected_month THEN
            v_is_delayed := TRUE;
        END IF;

        -- Consolidación
        INSERT INTO public.driver_monthly_metrics (
            metric_month, driver_id, total_distance_km, total_trips_completed,
            total_moving_time_hours, total_idle_time_hours, average_speed_kmh,
            max_speed_kmh, incidents_count, checksum
        )
        SELECT
            v_month_start, m.driver_id,
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

        -- Purga
        WITH d_loc AS (
            DELETE FROM public.driver_location_history
            WHERE captured_at >= v_month_start AND captured_at < v_month_end
            RETURNING id
        ) SELECT COUNT(*) INTO v_deleted_locs FROM d_loc;

        WITH d_rel AS (
            DELETE FROM public.device_relay_events
            WHERE received_at >= v_month_start AND received_at < v_month_end
            RETURNING id
        ) SELECT COUNT(*) INTO v_deleted_relays FROM d_rel;

        WITH d_syn AS (
            DELETE FROM public.synchronization_attempts
            WHERE attempted_at >= v_month_start AND attempted_at < v_month_end
            RETURNING id
        ) SELECT COUNT(*) INTO v_deleted_syncs FROM d_syn;

        INSERT INTO public.purge_execution_log (
            period_closed_date, records_deleted_location_history,
            records_deleted_relay_events, records_deleted_sync_attempts,
            executed_by, status, details, is_delayed
        ) VALUES (
            v_month_start, v_deleted_locs, v_deleted_relays, v_deleted_syncs,
            'maintenance_job',
            CASE WHEN v_is_delayed THEN 'delayed_success' ELSE 'success' END,
            CASE WHEN v_is_delayed 
                 THEN format('Purga ejecutada con retraso para el periodo cerrado %s tras posible pausa de servicio.', v_month_start)
                 ELSE format('Periodo %s cerrado exitosamente en cron regular.', v_month_start)
            END,
            v_is_delayed
        );

        RETURN jsonb_build_object(
            'status', CASE WHEN v_is_delayed THEN 'delayed_success' ELSE 'success' END,
            'period_closed', v_month_start,
            'is_delayed', v_is_delayed,
            'deleted_location_records', v_deleted_locs,
            'deleted_relay_records', v_deleted_relays,
            'deleted_sync_records', v_deleted_syncs
        );
    END IF;

    -- Si p_closed_month es NULL: Detectar todos los periodos cerrados no purgados en orden cronológico
    FOR v_period_record IN
        SELECT DISTINCT date_trunc('month', captured_at)::DATE AS unpurged_month
        FROM public.driver_location_history
        WHERE captured_at < date_trunc('month', CURRENT_DATE)
          AND date_trunc('month', captured_at)::DATE NOT IN (
              SELECT period_closed_date 
              FROM public.purge_execution_log 
              WHERE status IN ('success', 'delayed_success')
          )
        ORDER BY unpurged_month ASC
    LOOP
        v_month_start := v_period_record.unpurged_month;
        v_month_end := (v_month_start + INTERVAL '1 month')::DATE;
        v_is_delayed := (v_month_start < v_standard_expected_month);

        -- Consolidación de métricas
        INSERT INTO public.driver_monthly_metrics (
            metric_month, driver_id, total_distance_km, total_trips_completed,
            total_moving_time_hours, total_idle_time_hours, average_speed_kmh,
            max_speed_kmh, incidents_count, checksum
        )
        SELECT
            v_month_start, m.driver_id,
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

        -- Borrado seguro
        WITH d_loc AS (
            DELETE FROM public.driver_location_history
            WHERE captured_at >= v_month_start AND captured_at < v_month_end
            RETURNING id
        ) SELECT COUNT(*) INTO v_deleted_locs FROM d_loc;

        WITH d_rel AS (
            DELETE FROM public.device_relay_events
            WHERE received_at >= v_month_start AND received_at < v_month_end
            RETURNING id
        ) SELECT COUNT(*) INTO v_deleted_relays FROM d_rel;

        WITH d_syn AS (
            DELETE FROM public.synchronization_attempts
            WHERE attempted_at >= v_month_start AND attempted_at < v_month_end
            RETURNING id
        ) SELECT COUNT(*) INTO v_deleted_syncs FROM d_syn;

        -- Registro en bitácora con bandera is_delayed
        INSERT INTO public.purge_execution_log (
            period_closed_date, records_deleted_location_history,
            records_deleted_relay_events, records_deleted_sync_attempts,
            executed_by, status, details, is_delayed
        ) VALUES (
            v_month_start, v_deleted_locs, v_deleted_relays, v_deleted_syncs,
            'resilient_maintenance_job',
            CASE WHEN v_is_delayed THEN 'delayed_success' ELSE 'success' END,
            CASE WHEN v_is_delayed 
                 THEN format('Periodo histórico cerrado %s purgado con RETRASO tras reanudación de servicio.', v_month_start)
                 ELSE format('Periodo %s cerrado exitosamente en cron regular.', v_month_start)
            END,
            v_is_delayed
        );

        v_months_processed := v_months_processed || jsonb_build_object(
            'period', v_month_start,
            'is_delayed', v_is_delayed,
            'deleted_locations', v_deleted_locs
        );
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'complete',
        'periods_processed', v_months_processed
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

REVOKE ALL ON FUNCTION public.consolidate_and_purge_monthly(DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consolidate_and_purge_monthly(DATE) TO authenticated, service_role;
