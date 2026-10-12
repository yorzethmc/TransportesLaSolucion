# Modelo de Amenazas (Threat Model) — V1.1

**Proyecto:** Transportes La Solución  
**Metodología:** STRIDE simplificada enfocada en APIs de Transporte y Dispositivos Móviles.

---

## 1. Identificación y Mitigación de Amenazas

| Categoría STRIDE | Amenaza Identificada | Impacto | Mitigación Implementada |
| :--- | :--- | :---: | :--- |
| **Spoofing (Suplantación)** | Conductor B intenta enviar ubicaciones haciéndose pasar por Conductor A. | Crítico | Validación estricta en `ingest_gps_batch_v2` forzando que `v_sample.driver_id == get_current_driver_id()`. Rechazo de lote si no coincide. |
| **Tampering (Manipulación)** | Modificación de métricas calculadas o distancias para alterar pagos. | Alto | Políticas RLS deniegan `INSERT` y `UPDATE` en `driver_daily_metrics` y `driver_monthly_metrics` para el rol `driver`. Solo funciones `SECURITY DEFINER` de backend pueden escribir. |
| **Repudiation (Repudio)** | Negativa de haber recibido o aceptado un viaje. | Medio | Tabla `trip_status_history` y `audit_logs` con `auth.uid()` y marca temporal inmutable. |
| **Information Disclosure (Fuga de Información)** | Conductor consulta rutas, pasajeros o teléfonos de otros conductores. | Alto | RLS en `trips` restringe la lectura únicamente a `driver_id = get_current_driver_id()`. Clientes sin cuentas; sus teléfonos solo los ve el admin. |
| **Denial of Service (DoS)** | Saturación del backend enviando millones de muestras falsas. | Alto | Límite máximo de 200 eventos por lote en `ingest_gps_batch_v2`. Filtro de velocidad máxima (> 162 km/h) y precisión (> 150m). |
| **Elevation of Privilege (Elevación de Privilegios)** | Usuario cliente o conductor invoca operaciones administrativas. | Crítico | Edge Function `manage-driver` y funciones SQL verifican `public.is_admin()`. La clave `service_role` jamás se expone en navegadores ni en el APK. |

---

## 2. Protección de Credenciales
- No existen contraseñas en tablas públicas.
- Se utiliza Supabase Auth con hashing bcrypt/argon2 nativo.
- Identificador técnico invisible (`506XXXXXXXX@drivers.internal`) previene enumeración de correos.
