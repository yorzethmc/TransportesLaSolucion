-- ==============================================================================
-- TRANSPORTES LA SOLUCIÓN - SEED DATA (DATOS INICIALES PARA PRUEBAS Y PRODUCCIÓN)
-- V1: Fundación
-- ==============================================================================

-- 1. CATÁLOGO DE ROLES DEL SISTEMA
INSERT INTO public.roles (name, description) VALUES
    ('super_admin', 'Control total de la plataforma, auditoría y administración de usuarios'),
    ('dispatcher', 'Gestión operativa de reservas, despacho de viajes y asignación de unidades'),
    ('driver', 'Conductor de unidad con acceso a turnos, viajes asignados y telemetría'),
    ('analyst', 'Visualización de métricas, reportes y tendencias sin permisos de edición')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 2. PARÁMETROS GLOBALES DE CONFIGURACIÓN
INSERT INTO public.app_configuration (key, value, description) VALUES
    ('gps_interval_standard_ms', '300000', 'Intervalo estándar de captura GPS en milisegundos (5 minutos)'),
    ('gps_interval_idle_ms', '600000', 'Intervalo de captura cuando la unidad está detenida y sin viaje (10 minutos)'),
    ('gps_max_accuracy_meters', '50', 'Tolerancia máxima de error satelital en metros'),
    ('company_name', 'Transportes La Solución', 'Nombre comercial de la empresa de transporte'),
    ('support_phone', '50672094457', 'Teléfono oficial de asistencia y despacho')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- 3. VEHÍCULOS INICIALES DE LA FLOTA
INSERT INTO public.vehicles (plate_number, brand, model, year, type, passenger_capacity, luggage_capacity_pieces, status) VALUES
    ('TLS-101', 'Toyota', 'HiAce Commuter VIP', 2024, 'van_vip', 11, 10, 'available'),
    ('TLS-102', 'Hyundai', 'Staria Luxury', 2023, 'van_vip', 9, 8, 'available'),
    ('TLS-103', 'Toyota', 'Fortuner 4x4', 2024, 'suv', 6, 5, 'available'),
    ('TLS-104', 'Mercedes-Benz', 'Sprinter Executive', 2023, 'minibus', 16, 16, 'available')
ON CONFLICT (plate_number) DO NOTHING;
