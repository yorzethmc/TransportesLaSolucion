# Modelo de Seguridad y Control de Acceso — V1: Fundación

**Enfoque:** Zero-Trust, Principio de Menor Privilegio (PoLP) y Defensa en Profundidad.

---

## 1. Principios de Seguridad Aplicados

1. **Aislamiento en Base de Datos (Row Level Security):**
   - La seguridad no depende del frontend ni de la API. PostgreSQL evalúa cada sentencia SQL contra `auth.uid()` y las funciones `public.has_role()`.
   - Un conductor no puede ver las coordenadas ni los viajes de otro conductor aunque manipule las peticiones de red.
2. **Protección de Credenciales de Servicio:**
   - La clave `service_role` de Supabase está estrictamente prohibida en el frontend web, en el APK móvil y en el repositorio de código.
   - Solo la clave pública `anon` reside en las aplicaciones cliente.
3. **Privacidad de Localización:**
   - No se capturan ubicaciones GPS fuera de un turno de trabajo activo (`work_shifts.status = 'active'`).
   - El conductor es notificado mediante una notificación persistente de Android en primer plano durante todo el seguimiento.
4. **Idempotencia y Anti-Inyección:**
   - Toda la ingesta de telemetría utiliza identificadores únicos de evento `device_event_id` y consultas parametrizadas en la función `ingest_gps_batch`.
