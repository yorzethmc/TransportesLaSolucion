# Arquitectura del Sistema Refinada — V1.1

**Proyecto:** Transportes La Solución  
**Fecha:** 2026-10-12  
**Estado:** V1.1 Implementada  

---

## 1. Topología del Sistema

```
                      [Público / Clientes]
                               │
                       (Web index.html)
                               │
                               ▼
                   POST /transport_requests
             (Genera TLS-YYYYMMDD-0001 en BD)
                               │
                 ┌─────────────┴─────────────┐
                 ▼                           ▼
        [PostgreSQL / Supabase]     [Abre WhatsApp Opcional]
                 │                   (Con N° de Solicitud)
                 │
                 ├──────────────────────────────┐
                 ▼                              ▼
      [Dashboard Administrativo]       [App Chofer Android]
      - Despacha a unidades            - Autenticación por teléfono
      - Mapa en vivo de choferes       - Captura cada 5 min (Foreground)
      - Gestión de flota               - Cola persistente offline
      - Purga y métricas               - Relay Google Nearby experimental
```

---

## 2. Refinamiento de Roles
- **Rol `admin`:** Control total operativo, creación de choferes, despacho de viajes, monitoreo de telemetría y ejecución de purgas mensuales.
- **Rol `driver`:** Conductor de unidad. Acceso exclusivo a sus viajes, inicio/fin de turno y telemetría propia.

---

## 3. Modelo de Autenticación Telefónica
- Los conductores inician sesión con **Número Telefónico** y **Contraseña**.
- Formato normalizado a estándar internacional (ej: `50688888888`).
- Mapeo técnico interno en Supabase Auth: `50688888888@drivers.internal` (invisible al chofer, sin verificación por email requerida).
- Restablecimiento administrativo de contraseñas mediante Edge Function protegida `manage-driver`.

---

## 4. Estrategia de Telemetría GPS y Sincronización
- **Captura:** Sensor satelital cada ~5 minutos durante turno activo.
- **Segundo Plano:** `GpsForegroundService` de Android con notificación persistente para evitar que el sistema operativo suspenda el proceso al apagar la pantalla.
- **Persistencia Local:** Inserción inmediata en SQLite/Storage local antes de intentar conexión a red.
- **Sincronización:** Envíos por lotes (hasta 50 eventos) a la RPC `ingest_gps_batch_v2` con reintentos y backoff exponencial (3s a 120s).
- **Separación de Datos:** 
  - `driver_current_location` para despacho en vivo.
  - `driver_location_history` para auditoría y métricas.
- **Consolidación y Purgado Mensual:** Función `consolidate_and_purge_monthly` programada con Supabase Cron que consolida métricas mensuales (`driver_monthly_metrics`), calcula checksums y depura telemetría cruda del periodo cerrado.
