# Manifiesto de Archivos Públicos para Despliegue en Cloudflare Pages / Vercel

Este documento detalla la lista exacta y explícita de archivos estáticos y compilados que componen la distribución pública del sistema para su alojamiento en proveedores CDN/Edge (Cloudflare Pages, Vercel o GitHub Pages):

## 1. Archivos en Raíz del Sitio (`dist-pages/` o `public-web/`)
- `index.html` — Landing page principal de reservas y hub de acceso a aplicaciones.
- `favicon.svg` — Icono vectorial SVG integrado.
- `.nojekyll` — Indicador de omisión de procesador Jekyll para rutas dinámicas.

## 2. Hojas de Estilo y Recursos Visuales
- `css/style.css` — Estilos visuales del cliente público.

## 3. Scripts del Cliente Público
- `js/app.js` — Lógica de reservas, geocodificación y comunicación.
- `js/config.js` — Constantes de interfaz y umbrales de pasajeros.
- `js/geo.js` — Manejo de geolocalización por navegador y radar satelital.
- `js/tester.js` — Módulo seguro de simulación en memoria.

## 4. Datos Estáticos
- `data/destinations.json` — Catálogo de destinos autorizados (Costa Rica / Nicaragua).

## 5. Distribución de App Móvil Android
- `apk/TransportesLaSolucion-Chofer.apk` — Instalador APK compilado con Gradle para conductores.

## 6. Panel Administrativo Web (`/admin/`)
- `admin/index.html` — Punto de entrada SPA del panel administrativo.
- `admin/assets/index-*.js` — Bundle compilado React + Vite del panel de control.
- `admin/assets/index-*.css` — Estilos CSS compilados del dashboard.

## 7. App Conductor en Modo Web (`/chofer/`)
- `chofer/index.html` — Punto de entrada SPA de la app de chofer en navegador.
- `chofer/assets/index-*.js` — Bundle compilado React + Vite de la aplicación de chofer.
- `chofer/assets/index-*.css` — Estilos CSS compilados de la aplicación de chofer.

---

## Archivos Excluidos Explícitamente (NO Publicables en CDN)
- Archivos `.env`, `.env.*` (secretos de Supabase y credenciales de BD).
- `docs/legacy/*` (`index.backup.html`, `schema.sql`).
- Código fuente nativo de Android (`frontend/driver-app/android/*`).
- Migraciones de base de datos (`backend/supabase/migrations/*`).
- Edge Functions Deno (`backend/supabase/functions/*`).
- Suite de pruebas de base de datos pgTAP (`backend/supabase/tests/*`).
