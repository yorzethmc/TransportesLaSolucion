# Auditoría Técnica de Repositorio — V1.1

**Proyecto:** Transportes La Solución  
**Rama:** `fix/v1.1-backend-android-foundation`  
**Fecha:** 2026-10-12  
**Auditor Responsable:** Agente 1 (Software Architect)  

---

## 1. Estado de los Componentes Existentes

### 1.1 Confirmado (Implementado y Válido)
- **Monorepo Workspaces:** `package.json` raíz y `tsconfig.base.json` configurados correctamente con soporte para `apps/*` y `packages/*`.
- **Paquetes Tipados Compilados:**
  - `packages/types`: Exporta tipos estrictos para entidades y eventos.
  - `packages/configuration`: Define constantes globales, intervalos de captura (5 min) y límites de precisión.
  - `packages/validation`: Implementa funciones de validación con suite de pruebas aprobada (8 tests superados).
  - `packages/api-client`: Cliente base de Supabase y llamada RPC para telemetría.
- **Frontend Público Base:** `index.html` contiene el diseño visual VIP y el disparador de 10 toques para la "Ventana de Chofer".

### 1.2 Parcial (Requiere Corrección o Adaptación)
- **Migración Inicial (`20261012000000_v1_initial_schema.sql`):** 
  - Define roles obsoletos (`super_admin`, `dispatcher`, `analyst`). Los requisitos actuales exigen estrictamente dos roles: `admin` y `driver`.
  - La RPC `ingest_gps_batch` no cuenta con `search_path` explícito y no maneja conversiones `NULLIF` para strings vacíos provenientes de JSON en campos numéricos/UUID.
  - Las reservaciones (`reservations`) deben alinearse con la especificación `transport_requests` (código `TLS-YYYYMMDD-0001` y estado `whatsapp_opened`).
- **Autenticación en `api-client`:**
  - Espera un correo electrónico visible, mientras que el negocio exige **inicio de sesión exclusivamente con teléfono y contraseña** para conductores, resolviendo internamente el alias técnico `phone@drivers.internal`.

### 1.3 Faltante (Por Implementar en V1.1)
- **Migración Incremental V1.1 (`20261012010000_v1_1_schema_refinement.sql`):**
  - Simplificación de roles a `admin` y `driver`.
  - Creación de tabla `transport_requests` y su historial.
  - Creación de `device_relay_events`, `synchronization_attempts`, `driver_monthly_metrics`, `vehicle_monthly_metrics` y `purge_execution_log`.
  - Reemplazo y blindaje de la RPC `ingest_gps_batch` con `NULLIF`, `search_path = public, auth`, control de lotes y códigos de rechazo.
  - Procedimiento almacenado de consolidación y borrado mensual.
- **Servicios Backend / Edge Functions:**
  - Endpoints seguros para gestión de conductores (crear, editar, resetear contraseña) y solicitudes públicas sin exponer la clave `service_role`.
- **Aplicación Android (`apps/driver-app`):**
  - Proyecto Capacitor con React + TypeScript.
  - SQLite local para persistencia offline y cola de eventos.
  - Foreground Service y WorkManager para captura periódica de 5 minutos y sincronización.
  - Navegación hacia Waze, Google Maps, llamadas y WhatsApp.
- **Módulo Experimental de Conectividad entre Dispositivos:**
  - Lógica de store-and-forward, gateway selection y firmas criptográficas.
- **Dashboard Administrativo (`apps/admin-dashboard`):**
  - Interfaz web operativa para gestión de choferes, vehículos, solicitudes y mapa en tiempo real.
- **Documentación de Arquitectura y Seguridad:**
  - Threat model, matriz RLS, planes de migración y rollback, evidencias de pruebas.

---

## 2. Matriz de Brechas y Decisiones Arquitectónicas

| Componente | Estado V1 | Decisión V1.1 |
| :--- | :--- | :--- |
| **Roles** | 4 roles (`super_admin`, `dispatcher`, `driver`, `analyst`) | Reducir a 2 roles: `admin` y `driver` mediante migración incremental sin alterar destructivamente el histórico. |
| **Login Conductor** | Correo + Contraseña | Teléfono + Contraseña. Se normaliza a formato E.164 internacional (ej. `50688888888`) y se mapea internamente a `50688888888@drivers.internal`. |
| **Solicitudes** | Tabla `reservations` genérica | Tabla `transport_requests` con correlativo `TLS-YYYYMMDD-0001` y persistencia obligatoria previa a WhatsApp. |
| **RPC GPS** | Ingesta básica | RPC securizada con `search_path`, `NULLIF`, códigos de error estructurados y validaciones geográficas. |
| **App Conductor** | Enlace estático en HTML | Proyecto móvil Capacitor (`apps/driver-app`) con SQLite y servicio en segundo plano. |
| **Retención** | Sin depuración programada | Procedimiento de consolidación mensual y purga de histórico con bitácora `purge_execution_log`. |
