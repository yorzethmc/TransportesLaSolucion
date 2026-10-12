# V1.2: Auditoría y Verificación del Estado Real del Repositorio

**Fecha:** 2026-10-12  
**Rama:** `fix/v1.1-backend-android-foundation`  
**Objetivo:** Contrastar cada afirmación de la entrega V1.1 contra la evidencia real de ejecución en el sistema de archivos y entorno de ejecución.

---

## 1. Matriz de Verificación del Estado Real (V1.1 vs V1.2)

| Componente | Reportado en V1.1 | Estado Real en V1.2 | Evidencia de Comprobación |
| :--- | :--- | :--- | :--- |
| **Repositorio y Git** | Rama limpia `fix/v1.1-backend-android-foundation` | **VERIFICADO** | `git status` limpio; historial de 11 commits documentados. |
| **Datos Personales en `data/`** | Sin datos sensibles | **VERIFICADO** (Seguro) | `data/destinations.json` contiene únicamente destinos públicos; `data/schema.sql` contiene DDL genérico. Sin PII. |
| **Binarios en `apk/`** | Ninguno en Git | **VERIFICADO** | `apk/` contiene solo `README.md`. No hay binarios `.apk` bajo control de versiones. |
| **Persistencia de Solicitudes (`index.html`)** | Persistente en DB antes de WhatsApp | **FALLIDO / PARCIAL** | `index.html` guarda en `localStorage` (`tls_transport_requests`) con ID generado por `Math.random()`. **No invoca** `create-transport-request`. |
| **Cola Offline Móvil (`offlineQueue.ts`)** | SQLite local | **INCORRECTO** | Utiliza `localStorage.getItem('tls_driver_offline_gps_queue')`. No tiene SQLite ni Room nativo. |
| **Proyecto Nativo Android (`apps/driver-app/android`)** | Proyecto Capacitor compilable | **INCOMPLETO** | Solo existen `AndroidManifest.xml` y `GpsForegroundService.kt`. **No existen** `build.gradle`, `gradlew`, ni `MainActivity`. `npx cap add android` no fue ejecutado. |
| **Validación Admin en Edge Function (`manage-driver`)** | Validación completa y auditoría | **PARCIAL** | Valida JWT con `auth.getUser()` y rol en `user_roles`. Sin embargo, solo implementa 4 acciones (`create`, `update`, `toggle_active`, `reset_password`). Faltan 5 acciones y filtra detalles en errores. |
| **Motor de Base de Datos Local (`supabase start`)** | Supabase listo | **BLOQUEADO** | `npx supabase start` falla con: `DockerLifecycleInspectError: docker: command not found (podman also not found)`. Docker no está instalado en el host. |
| **Pruebas SQL Automatizadas (`supabase test db`)** | Pruebas listas | **BLOQUEADO (Local)** | Scripts `.sql` existen en `supabase/tests/`, pero no son pgTAP y requieren Docker para `supabase test db`. |
| **Herramientas de Compilación Android (`javac`, `gradlew`, `adb`)** | APK listo para compilar | **BLOQUEADO** | Ni `java` (JDK), ni `ANDROID_HOME`, ni `adb` están instalados o disponibles en PATH en esta máquina. |

---

## 2. Inventario de Herramientas del Entorno

| Herramienta | Comando | Estado | Salida / Causa |
| :--- | :--- | :--- | :--- |
| **Node.js** | `node -v` | **Disponible** | `v25.3.0` |
| **NPM** | `npm -v` | **Disponible** | `11.15.0` |
| **Supabase CLI** | `npx supabase --version` | **Disponible** | `2.120.0` |
| **Docker** | `docker --version` | **No disponible (Bloqueante DB local)** | `The term 'docker' is not recognized` (ni Docker Desktop ni Podman instalados). |
| **WSL** | `wsl -l -v` | **No instalado** | `The Windows Subsystem for Linux is not installed.` |
| **Java JDK** | `java -version` | **No disponible (Bloqueante APK)** | `The term 'java' is not recognized` (Requiere JDK 17+). |
| **Android SDK** | `$env:ANDROID_HOME` | **No disponible (Bloqueante APK)** | Variable no configurada, SDK no hallado en `%LOCALAPPDATA%\Android\Sdk`. |
| **ADB** | `adb --version` | **No disponible (Bloqueante Emulador)** | `The term 'adb' is not recognized`. |

---

## 3. Conclusión de la Auditoría Inicial

1. **Backend SQL:** Las migraciones SQL `20261012000000_v1_initial_schema.sql` y `20261012010000_v1_1_schema_refinement.sql` son sintácticamente ricas y contienen RLS y RPCs, pero deben ajustarse a los nuevos requisitos de la Fase 1 (reglas GPS permissivas con `quality_flag`, eliminación de menciones de 90 días, `pg_cron` de consolidación mensual, y formato pgTAP).
2. **Edge Functions:** Requieren expansión para soportar las 9 operaciones administrativas, sanitización de respuestas de error 401/403, e implementación de la función `login-driver` y rate limiting real.
3. **Página Web Pública:** Debe dejar de usar `localStorage` y número aleatorio, llamando a la Edge Function o endpoint backend antes de permitir abrir WhatsApp, y obteniendo el teléfono del dueño de forma dinámica.
4. **Driver App (Capacitor/Android):** Debe ejecutarse `npx cap add android` para crear el proyecto Gradle real (`build.gradle`, `gradlew`, `MainActivity`), implementar el plugin nativo `TrackingPlugin`, Room Database y `Worker` de sincronización con `WorkManager`. La compilación final del APK quedará formalmente documentada como **BLOQUEADA** en este host por ausencia de JDK y Android SDK.
