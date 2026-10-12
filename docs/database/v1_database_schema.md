# Especificación del Modelo de Datos — V1: Fundación

**Motor:** PostgreSQL 15+ con extensión PostGIS  
**Seguridad:** Row Level Security (RLS) habilitado en el 100% de las tablas.

---

## 1. Tablas Principales

| Tabla | Clave Primaria | Propósito | RLS |
| :--- | :--- | :--- | :--- |
| `profiles` | UUID (auth.users.id) | Información general de usuarios | Propio usuario / Admin |
| `roles` | `user_role_type` | Catálogo de roles (super_admin, dispatcher, driver, analyst) | Lectura autenticada |
| `user_roles` | `(user_id, role)` | Mapeo de roles a usuarios | Solo Admin |
| `drivers` | UUID | Ficha técnica y licencia del conductor | Chofer lee suyo / Admin todo |
| `driver_devices` | UUID | Dispositivos Android registrados | Chofer y Admin |
| `vehicles` | UUID | Catálogo de busetas y vehículos de la flota | Lectura autenticada |
| `driver_vehicle_assignments` | UUID | Historial de asignación unidad-chofer | Admin / Despachador |
| `work_shifts` | UUID | Registro de turnos de trabajo y odómetros | Chofer y Admin |
| `customers` | UUID | Clientes registrados | Admin / Despachador |
| `reservations` | UUID | Reservas realizadas por clientes | Inserción anónima / Admin |
| `trips` | UUID | Despacho operativo de traslados | Chofer asignado / Admin |
| `trip_assignments` | UUID | Paradas y asignación de viajes | Chofer asignado / Admin |
| `trip_status_history` | UUID | Trazabilidad de transiciones de estado | Admin / Chofer |
| `driver_current_location` | UUID (driver_id) | Ubicación en tiempo real para el mapa | Chofer actualiza suyo / Admin lee |
| `driver_location_history` | BIGINT Identity | Histórico completo de telemetría | Chofer inserta / Admin lee |
| `driver_daily_metrics` | UUID | Métricas consolidadas por día | Solo lectura |
| `trip_metrics` | UUID | Métricas consolidadas por viaje | Solo lectura |
| `incidents` | UUID | Averías mecánicas o accidentes en ruta | Chofer y Admin |
| `notifications` | UUID | Notificaciones internas | Usuario destinatario |
| `app_configuration` | VARCHAR (key) | Parámetros remotos de la flota | Solo Admin |
| `audit_logs` | UUID | Registro de auditoría de cambios sensibles | Solo Admin |
