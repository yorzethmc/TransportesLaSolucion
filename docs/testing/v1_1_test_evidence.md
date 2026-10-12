# Evidencia de Pruebas Automatizadas — V1.1

**Proyecto:** Transportes La Solución  
**Fecha:** 2026-10-12  
**Entorno de Ejecución:** Node.js v25.3.0 / TypeScript 5.9.3 Strict / Windows.

---

## 1. Resumen Consolidado de Pruebas

| Suite de Pruebas | Archivo / Script | Pruebas Ejecutadas | Resultado | Estado |
| :--- | :--- | :---: | :---: | :---: |
| **Pruebas Unitarias de Validación** | `packages/validation/test/validation.test.ts` | 13 | 13 Pasadas / 0 Fallidas | **APROBADO** |
| **Pruebas de Integración y Seguridad** | `packages/validation/test/integration.test.ts` | 8 | 8 Pasadas / 0 Fallidas | **APROBADO** |
| **Aserciones SQL de RLS y PostGIS** | `supabase/tests/v1_rls_test.sql` | 4 bloques | Verificación de 20 tablas RLS y funciones PostGIS | **APROBADO** |
| **Pruebas de Ingesta GPS Segura** | `supabase/tests/v1_1_gps_ingestion_test.sql` | 4 aserciones | Validaciones server-side, NULLIF e idempotencia | **APROBADO** |
| **Pruebas de Purgado y Consolidación** | `supabase/tests/v1_1_monthly_purge_test.sql` | 3 aserciones | Bloqueo en mes abierto y registro en bitácora | **APROBADO** |
| **Compilación Estricta Monorepo** | `npm run build` | 6 proyectos | Tipado estricto sin errores | **APROBADO** |

---

## 2. Detalle de Pruebas Negativas y Casos de Borde

### 2.1 Seguridad en Telemetría GPS
- **Caso:** Evento sin `deviceEventId`. **Resultado:** Rechazado.
- **Caso:** Coordenada con latitud `-95.0°`. **Resultado:** Rechazado.
- **Caso:** Coordenada con longitud `200.0°`. **Resultado:** Rechazado.
- **Caso:** Velocidad `60.0 m/s` (216 km/h). **Resultado:** Rechazado por superar umbral físico plausible (máx 45 m/s).

### 2.2 Normalización de Teléfonos en Solicitudes
- **Entrada:** `8700-1122` (8 dígitos locales).
- **Salida:** `50687001122` (Normalizado E.164 internacional).
- **Persistencia:** Solicitud validada e indexada en PostgreSQL antes de habilitar deep link de WhatsApp.

### 2.3 Store-and-Forward (Relay entre Dispositivos)
- **Caso:** Sobre con `hopCount = 3`. **Resultado:** Rechazado por superar el límite estricto de 2 saltos.
- **Caso:** Sobre con más de 48 horas de antigüedad. **Resultado:** Descartado por expiración de custodia.

### 2.4 Purgado Mensual
- **Caso:** Intento de ejecutar `consolidate_and_purge_monthly` en el mes en curso. **Resultado:** Excepción controlada `Abortado: el periodo aún no ha concluido`.
