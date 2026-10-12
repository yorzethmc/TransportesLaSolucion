-- ==============================================================================
-- PRUEBAS DE CONSOLIDACIÓN MENSUAL Y PURGADO SEGURO (V1.1)
-- ==============================================================================

DO $$
DECLARE
    v_test_month DATE := '2026-08-01'; -- Mes cerrado pasado
    v_open_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
    v_blocked_error BOOLEAN := FALSE;
    v_purge_result JSONB;
BEGIN
    RAISE NOTICE '>>> INICIANDO PRUEBAS DE CONSOLIDACIÓN Y PURGADO V1.1 <<<';

    -- 1. Prueba: El sistema DEBE RECHAZAR el purgado del mes actual en curso (periodo abierto)
    BEGIN
        PERFORM public.consolidate_and_purge_monthly(v_open_month);
    EXCEPTION WHEN OTHERS THEN
        v_blocked_error := TRUE;
        RAISE NOTICE '✓ APROBADO: El sistema bloqueó exitosamente el intento de purga sobre un mes en curso.';
    END;

    IF NOT v_blocked_error THEN
        RAISE EXCEPTION 'FALLO DE SEGURIDAD: Se permitió purgar un periodo que aún no ha cerrado.';
    END IF;

    -- 2. Prueba: Ejecutar consolidación y purga sobre periodo cerrado válido
    SELECT public.consolidate_and_purge_monthly(v_test_month) INTO v_purge_result;
    RAISE NOTICE '✓ Resultado de purga en periodo cerrado: %', v_purge_result;

    -- 3. Verificar que la bitácora purge_execution_log registre la acción
    IF NOT EXISTS (SELECT 1 FROM public.purge_execution_log WHERE period_closed_date = v_test_month) THEN
        RAISE EXCEPTION 'FALLO: No se encontró registro en purge_execution_log para el periodo purgado.';
    ELSE
        RAISE NOTICE '✓ APROBADO: Bitácora purge_execution_log auditada correctamente.';
    END IF;

    RAISE NOTICE '>>> TODAS LAS PRUEBAS DE CONSOLIDACIÓN Y PURGADO FINALIZARON CON ÉXITO <<<';
END $$;
