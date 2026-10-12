-- ==============================================================================
-- PRUEBAS DE VERIFICACIÓN AUTOMATIZADA: SCHEMA & SEGURIDAD RLS
-- V1: Fundación - Transportes La Solución
-- ==============================================================================

DO $$
DECLARE
    v_unprotected_tables INTEGER;
    v_roles_count INTEGER;
    v_vehicles_count INTEGER;
BEGIN
    RAISE NOTICE '>>> INICIANDO BATERÍA DE PRUEBAS V1: SCHEMA Y RLS <<<';

    -- 1. Verificar que TODAS las tablas públicas tengan RLS habilitado
    SELECT COUNT(*) INTO v_unprotected_tables
    FROM pg_tables
    WHERE schemaname = 'public' 
      AND rowsecurity = FALSE;

    IF v_unprotected_tables > 0 THEN
        RAISE EXCEPTION 'FALLO DE SEGURIDAD: Hay % tablas sin Row Level Security (RLS) habilitado.', v_unprotected_tables;
    ELSE
        RAISE NOTICE '✓ APROBADO: Todas las tablas públicas tienen RLS estrictamente habilitado.';
    END IF;

    -- 2. Verificar existencia de roles requeridos
    SELECT COUNT(*) INTO v_roles_count FROM public.roles;
    IF v_roles_count < 4 THEN
        RAISE EXCEPTION 'FALLO: Se esperaban 4 roles básicos (super_admin, dispatcher, driver, analyst), encontrados: %', v_roles_count;
    ELSE
        RAISE NOTICE '✓ APROBADO: Catálogo de 4 roles verificado correctamente.';
    END IF;

    -- 3. Verificar vehículos iniciales
    SELECT COUNT(*) INTO v_vehicles_count FROM public.vehicles;
    IF v_vehicles_count < 1 THEN
        RAISE EXCEPTION 'FALLO: No hay vehículos registrados en el seed.';
    ELSE
        RAISE NOTICE '✓ APROBADO: Flota inicial registrada con éxito (% vehículos).', v_vehicles_count;
    END IF;

    -- 4. Verificar soporte de PostGIS y geometrías válidas
    PERFORM ST_SetSRID(ST_MakePoint(-84.2441, 10.0754), 4326);
    RAISE NOTICE '✓ APROBADO: PostGIS operativo para cálculo de coordenadas y proyecciones SRID 4326.';

    RAISE NOTICE '>>> TODAS LAS PRUEBAS V1 DE SCHEMA Y RLS FINALIZARON CON ÉXITO <<<';
END $$;
