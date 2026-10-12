# Guía de Despliegue y Configuración de Ambientes — V1.1

**Proyecto:** Transportes La Solución  
**Ambientes:** Local, Development, Production.

---

## 1. Requisitos Previos
- Node.js >= 20.x
- Supabase CLI o Proyecto Supabase Cloud (PostgreSQL 15+ con extensión PostGIS)
- Android Studio / SDK (para empaquetado nativo del APK de chofer)

---

## 2. Variables de Entorno Requeridas (.env)

```ini
# Supabase
SUPABASE_URL=https://[YOUR_PROJECT_ID].supabase.co
SUPABASE_ANON_KEY=[YOUR_ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[YOUR_SERVICE_ROLE_KEY]

# Configuración Operativa
DEFAULT_GPS_INTERVAL_MS=300000
MAX_ACTIVE_DRIVERS=10
```

---

## 3. Despliegue de Base de Datos (Supabase)
```bash
# 1. Aplicar migraciones en orden
supabase db push
# O ejecutar en el SQL Editor de Supabase:
# - supabase/migrations/20261012000000_v1_initial_schema.sql
# - supabase/migrations/20261012010000_v1_1_schema_refinement.sql

# 2. Cargar datos semilla de roles y vehículos
# - supabase/seed/seed.sql

# 3. Desplegar Edge Functions
supabase functions deploy manage-driver --no-verify-jwt
supabase functions deploy create-transport-request --no-verify-jwt
```

---

## 4. Compilación del APK para Conductores (Android)
```bash
cd apps/driver-app
npm install
npm run build
npx cap sync android
# Generar APK Debug
cd android
./gradlew assembleDebug
# El APK resultante se ubica en:
# apps/driver-app/android/app/build/outputs/apk/debug/app-debug.apk
```
