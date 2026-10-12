# Documento de Arquitectura de Software — V1: Fundación

**Proyecto:** Transportes La Solución  
**Fecha:** 2026-10-12  
**Estado:** V1 Implementada  

---

## 1. Visión General y Topología

La plataforma de **Transportes La Solución** opera bajo un esquema desacoplado y orientado a eventos, optimizado para flotas iniciales de hasta 10 conductores en turnos diarios de 12 horas:

```
[Cliente Público]       [App Chofer Android]        [Dashboard Admin]
        │                       │                           │
  (Web React)          (Capacitor + Offline)       (React + Realtime)
        │                       │                           │
        ▼                       ▼                           ▼
 ┌─────────────────────────────────────────────────────────────┐
 │            SUPABASE PLATFORM (POSTGRESQL + POSTGIS)         │
 │  - Supabase Auth (JWT, sesiones, revocación)                │
 │  - PostGIS (Cálculo de cercanía, Haversine, clustering)     │
 │  - Row Level Security (Aislamiento estricto por roles)      │
 │  - Realtime Engine (Transmisión de ubicaciones actuales)    │
 └─────────────────────────────────────────────────────────────┘
```

---

## 2. Componentes del Monorepo

```
TransportesLaSolucion/
├── apps/
│   ├── public-web/          # Web pública de clientes para reservas
│   ├── admin-dashboard/     # Panel de despacho y métricas
│   └── driver-app/          # App Android de chofer (Capacitor)
├── packages/
│   ├── types/               # Tipos TypeScript compartidos (compilado)
│   ├── configuration/       # Constantes y parámetros de negocio (compilado)
│   ├── validation/          # Validadores de auth y telemetría (compilado)
│   └── api-client/          # Cliente Supabase tipado y batch uploader (compilado)
├── supabase/
│   ├── migrations/          # 20261012000000_v1_initial_schema.sql
│   ├── seed/                # seed.sql (roles, config, vehículos)
│   └── tests/               # v1_rls_test.sql (verificación automatizada)
└── docs/                    # Documentación de arquitectura, seguridad y base de datos
```

---

## 3. Estrategia de Telemetría GPS

1. **Separación de Tablas:**
   - `driver_current_location`: Contiene 1 fila por conductor mediante `UPSERT`. Alimenta el mapa en vivo sin escanear históricos.
   - `driver_location_history`: Inserciones por lote. Retención basada en consolidación y purga mensual del mes calendario cerrado, indexado espacialmente con `GIST`.
2. **Idempotencia:** Campo `device_event_id` único por evento capturado en el dispositivo móvil, previniendo duplicados durante reconexiones.
3. **Filtro de Ruido:** Puntos con error satelital superior a 50 metros o velocidades mayores a 45 m/s (~160 km/h) son rechazados.
