# Matriz de Políticas Row Level Security (RLS) — V1.1

**Proyecto:** Transportes La Solución  
**Roles Evaluados:** `anon`, `authenticated (driver)`, `authenticated (admin)`.

---

| Tabla | Rol `anon` (Público) | Rol `driver` (Conductor) | Rol `admin` (Administrador) |
| :--- | :---: | :---: | :---: |
| `transport_requests` | `INSERT` (crear solicitud) | Sin acceso | `ALL` (lectura, edición, gestión) |
| `request_status_history` | Sin acceso | Sin acceso | `ALL` |
| `drivers` | Sin acceso | `SELECT` (solo su propio registro) | `ALL` |
| `driver_devices` | Sin acceso | `SELECT` (solo sus dispositivos) | `ALL` |
| `vehicles` | Sin acceso | `SELECT` (lectura catálogo) | `ALL` |
| `work_shifts` | Sin acceso | `SELECT`, `INSERT`, `UPDATE` (sus propios turnos) | `ALL` |
| `trips` | Sin acceso | `SELECT`, `UPDATE` (sus viajes asignados) | `ALL` |
| `driver_current_location` | Sin acceso | `ALL` (solo su propia fila) | `SELECT` (todos los choferes en vivo) |
| `driver_location_history` | Sin acceso | `INSERT` (mediante RPC segura) | `SELECT` |
| `device_relay_events` | Sin acceso | `INSERT` (eventos recibidos) | `ALL` |
| `synchronization_attempts`| Sin acceso | `INSERT` (sus propios intentos) | `ALL` |
| `driver_daily_metrics` | Sin acceso | `SELECT` (sus propias métricas) | `ALL` |
| `driver_monthly_metrics` | Sin acceso | `SELECT` (sus métricas mensuales) | `ALL` |
| `vehicle_monthly_metrics`| Sin acceso | Sin acceso | `ALL` |
| `incidents` | Sin acceso | `INSERT`, `SELECT` (sus incidentes) | `ALL` |
| `purge_execution_log` | Sin acceso | Sin acceso | `SELECT` |
| `app_configuration` | `SELECT` (parámetros públicos) | `SELECT` | `ALL` |
| `audit_logs` | Sin acceso | Sin acceso | `SELECT` |
