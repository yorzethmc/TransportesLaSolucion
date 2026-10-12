# Plan de Rollback de Base de Datos — V1.1

**Proyecto:** Transportes La Solución  
**Objetivo:** Revertir los cambios introducidos en `20261012010000_v1_1_schema_refinement.sql` preservando los datos intactos.

---

## 1. Script de Rollback

```sql
BEGIN;

-- 1. Revertir RPC V2
DROP FUNCTION IF EXISTS public.ingest_gps_batch_v2(JSONB);
DROP FUNCTION IF EXISTS public.consolidate_and_purge_monthly(DATE);

-- 2. Eliminar tablas agregadas en V1.1 si no contienen datos críticos
DROP TABLE IF EXISTS public.purge_execution_log CASCADE;
DROP TABLE IF EXISTS public.vehicle_monthly_metrics CASCADE;
DROP TABLE IF EXISTS public.driver_monthly_metrics CASCADE;
DROP TABLE IF EXISTS public.synchronization_attempts CASCADE;
DROP TABLE IF EXISTS public.device_relay_events CASCADE;
DROP TABLE IF EXISTS public.request_status_history CASCADE;
DROP TABLE IF EXISTS public.transport_requests CASCADE;

-- 3. Restaurar roles si fuese necesario
INSERT INTO public.roles (name, description) VALUES
    ('super_admin', 'Control total revertido'),
    ('dispatcher', 'Despacho revertido'),
    ('analyst', 'Analista revertido')
ON CONFLICT DO NOTHING;

UPDATE public.user_roles SET role = 'super_admin' WHERE role::text = 'admin';

COMMIT;
```

---

## 2. Validación Post-Rollback
1. Comprobar que `public.reservations` y `public.driver_location_history` continúen operativas.
2. Verificar que `public.ingest_gps_batch` original siga respondiendo.
