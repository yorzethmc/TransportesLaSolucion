# Riesgo de Pausa en Plan Free de Supabase y Estrategia de Resiliencia

## 1. Naturaleza del Riesgo
En el plan gratuito (**Free Plan**) de Supabase:
- Los proyectos sin actividad de API o consultas durante **7 días consecutivos** son pausados automáticamente para conservar recursos del pool.
- Cuando un proyecto entra en pausa:
  1. Los servicios de base de datos PostgreSQL, PostgREST y Auth se detienen.
  2. Los cron jobs internos de `pg_cron` (incluyendo la purga mensual de telemetría y consolidación de métricas) no se ejecutan mientras el proyecto esté pausado.
  3. Los conductores en ruta no pueden autenticarse ni transmitir telemetría en tiempo real (sus apps acumulan eventos en la cola local SQLite offline).

## 2. Medidas de Mitigación Implementadas

### A. Keep-Alive Automático cada 3 Días (.github/workflows/keep-alive.yml)
- Se programó un flujo en GitHub Actions que ejecuta cada 3 días a las 06:00 UTC un ping HTTP hacia la función RPC pública:
  `POST /rest/v1/rpc/health_check`
- **Seguridad**:
  - Utiliza únicamente `SUPABASE_PUBLISHABLE_KEY`.
  - La RPC `public.health_check()` es de solo lectura y no expone datos sensibles ni metadatos de usuarios/vehículos.
  - La llamada mantiene el contador de actividad del proyecto en estado activo sin incurrir en costos ni consumo de cuota.

### B. Resiliencia de Purga Histórica Acumulada
- Si por contingencia el proyecto llegase a pausarse o los jobs cron fallasen durante uno o más meses:
  - La función `public.consolidate_and_purge_monthly(NULL)` detecta **todos los periodos cerrados históricos no purgados**.
  - Los procesa en estricto orden cronológico ascendente (`ORDER BY unpurged_month ASC`).
  - Consolida las métricas del mes en `driver_monthly_metrics`.
  - Elimina de forma segura la telemetría cruda en `driver_location_history`, `device_relay_events` y `synchronization_attempts`.
  - Registra en `purge_execution_log` la bandera `is_delayed = TRUE` y el detalle `[RETRASO]` para auditoría y observabilidad del sistema.
