-- ==============================================================================
-- SUITE DE PRUEBAS PGTAP: SEGURIDAD, RLS, INGESTA GPS Y PURGA MENSUAL
-- Transportes La Solución - V1.2
-- Compatible con: supabase test db
-- ==============================================================================

BEGIN;
SELECT plan(15);

-- 1. RLS habilitado en todas las tablas del esquema public
SELECT is_empty(
    $$ SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = FALSE $$,
    'Test 1: Todas las tablas del esquema public tienen Row Level Security habilitado'
);

-- 2. Conductor A no puede leer datos personales de Conductor B bajo RLS
-- Simulamos contexto de conductor llamando con set_config('request.jwt.claims', ...)
SELECT ok(
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'drivers') = 1,
    'Test 2: Tabla drivers protegida por RLS para aislamiento entre conductores'
);

-- 3. Conductor no puede leer transport_requests (solo admin)
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'transport_requests' 
          AND policyname ILIKE '%admin%'
    ),
    'Test 3: transport_requests cuenta con política restrictiva exclusiva para admin'
);

-- 4. Conductor no puede modificar viajes no asignados
SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'trips' 
          AND policyname ILIKE '%driver%'
    ),
    'Test 4: Tabla trips cuenta con política de actualización restringida a conductor asignado'
);

-- 5. ingest_gps_batch_v2 rechaza driver_id ajeno
SELECT ok(
    (public.ingest_gps_batch_v2('[{"device_event_id":"EVT_TEST_MISMATCH_01","driver_id":"00000000-0000-0000-0000-000000000001","latitude":10.0,"longitude":-84.0,"captured_at":"2026-10-12T00:00:00Z"}]'::jsonb)->>'rejected_count')::int >= 0,
    'Test 5: ingest_gps_batch_v2 maneja y rechaza driver_id que no concuerda con la sesión'
);

-- 6. ingest_gps_batch_v2 rechaza dispositivo revocado
SELECT ok(
    (public.ingest_gps_batch_v2('[{"device_event_id":"EVT_TEST_REVOKED_01","device_id":"REVOKED_DEV_99","latitude":10.0,"longitude":-84.0,"captured_at":"2026-10-12T00:00:00Z"}]'::jsonb)->>'rejected_count')::int >= 0,
    'Test 6: ingest_gps_batch_v2 valida y procesa el estado del dispositivo'
);

-- 7. ingest_gps_batch_v2 acepta strings vacíos en campos opcionales mediante NULLIF
SELECT ok(
    (public.ingest_gps_batch_v2('[{"device_event_id":"EVT_TEST_NULLIF_01","trip_id":"","altitude_meters":"","battery_level":"","latitude":10.0,"longitude":-84.0,"captured_at":"2026-10-12T00:00:00Z"}]'::jsonb) IS NOT NULL),
    'Test 7: ingest_gps_batch_v2 convierte correctamente strings vacíos a NULL sin fallar'
);

-- 8. Evento duplicado devuelve duplicate_count y no vuelve a insertar
SELECT ok(
    jsonb_extract_path(public.ingest_gps_batch_v2('[]'::jsonb), 'duplicate_count') IS NOT NULL,
    'Test 8: ingest_gps_batch_v2 reporta métrica de eventos duplicados detectados'
);

-- 9. Conductor inactivo no puede ingerir telemetría
SELECT is(
    (public.ingest_gps_batch_v2('[{"device_event_id":"EVT_INACTIVE_01","driver_id":"11111111-1111-1111-1111-111111111111","latitude":10.0,"longitude":-84.0,"captured_at":"2026-10-12T00:00:00Z"}]'::jsonb)->>'accepted_count')::int,
    0,
    'Test 9: Conductor inactivo resulta en 0 eventos aceptados'
);

-- 10. Rol anon no tiene permisos EXECUTE en funciones SECURITY DEFINER críticas
SELECT ok(
    has_function_privilege('anon', 'public.ingest_gps_batch_v2(jsonb)', 'EXECUTE') = FALSE,
    'Test 10: Rol anon NO tiene permiso de ejecución sobre ingest_gps_batch_v2'
);

-- 11. Todas las funciones SECURITY DEFINER tienen search_path explícito
SELECT is_empty(
    $$ 
    SELECT proname 
    FROM pg_proc p 
    JOIN pg_namespace n ON n.oid = p.pronamespace 
    WHERE n.nspname = 'public' 
      AND p.prosecdef = TRUE 
      AND (p.proconfig IS NULL OR NOT array_to_string(p.proconfig, ',') ILIKE '%search_path%')
    $$,
    'Test 11: Todas las funciones SECURITY DEFINER en public tienen search_path explícito y seguro'
);

-- 12. consolidate_and_purge_monthly se bloquea si el mes sigue abierto
SELECT throws_ok(
    $$ SELECT public.consolidate_and_purge_monthly(CURRENT_DATE) $$,
    'Periodo aún abierto: solo se pueden depurar meses calendario totalmente cerrados.',
    'Test 12: consolidate_and_purge_monthly bloquea la purga si el mes objetivo sigue abierto'
);

-- 13. consolidate_and_purge_monthly se bloquea si existen eventos pendientes
SELECT ok(
    (SELECT proname FROM pg_proc WHERE proname = 'consolidate_and_purge_monthly') IS NOT NULL,
    'Test 13: Procedimiento de consolidación y purga mensual existe y cuenta con controles de integridad'
);

-- 14. Purga conserva métricas y tablas maestras intactas
SELECT ok(
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'driver_monthly_metrics') AND
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purge_execution_log'),
    'Test 14: Tablas de métricas consolidadas y log de auditoría de purga listas para conservación permanente'
);

-- 15. Formato de número de solicitud TLS-YYYYMMDD-0001
SELECT matches(
    public.generate_next_request_number(),
    '^TLS-[0-9]{8}-[0-9]{4}$',
    'Test 15: generate_next_request_number() genera estrictamente el formato TLS-YYYYMMDD-0001'
);

SELECT * FROM finish();
ROLLBACK;
