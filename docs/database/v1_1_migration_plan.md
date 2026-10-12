# Plan de Migración de Base de Datos — V1.1

**Proyecto:** Transportes La Solución  
**Migración:** `20261012010000_v1_1_schema_refinement.sql`  
**Estrategia:** Incremental, idempotente y sin tiempo de inactividad (Zero-Downtime).

---

## 1. Cambios Incluidos en V1.1
1. **Roles:**
   - Adición de rol `'admin'`.
   - Migración de usuarios con roles antiguos (`super_admin`, `dispatcher`, `analyst`) a `'admin'`.
   - Depuración de roles antiguos de la tabla `roles`.
2. **Conductores:**
   - Adición de `phone_number` único normalizado, `whatsapp_number`, `active`, `must_change_password`.
3. **Solicitudes:**
   - Creación de tabla `transport_requests` y su historial `request_status_history`.
   - Disparador `generate_request_number` con correlativo `TLS-YYYYMMDD-0001`.
4. **Relay y Telemetría:**
   - Creación de `device_relay_events` y `synchronization_attempts`.
   - Nueva RPC blindada `ingest_gps_batch_v2` con `search_path`, conversiones `NULLIF` y retorno de códigos de error.
5. **Métricas y Purga:**
   - Creación de `driver_monthly_metrics`, `vehicle_monthly_metrics` y `purge_execution_log`.
   - Función `consolidate_and_purge_monthly` programable en Supabase Cron.

---

## 2. Pasos de Ejecución
```bash
# Aplicar migración en entorno local o Supabase CLI
supabase db push
# O ejecutar el script SQL directamente en el editor SQL de Supabase Cloud
```
