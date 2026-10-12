import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distPagesDir = path.join(rootDir, 'dist-pages');
const publicWebDir = path.join(rootDir, 'frontend', 'public-web');
const adminDistDir = path.join(rootDir, 'frontend', 'admin-dashboard', 'dist');
const driverDistDir = path.join(rootDir, 'frontend', 'driver-app', 'dist');
const apkSource = path.join(
  rootDir,
  'frontend',
  'driver-app',
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);

console.log('🚀 Iniciando ensamblaje del paquete para GitHub Pages...');

// Limpiar y crear estructura dist-pages
fs.rmSync(distPagesDir, { recursive: true, force: true });
fs.mkdirSync(distPagesDir, { recursive: true });
fs.mkdirSync(path.join(distPagesDir, 'admin'), { recursive: true });
fs.mkdirSync(path.join(distPagesDir, 'chofer'), { recursive: true });
fs.mkdirSync(path.join(distPagesDir, 'apk'), { recursive: true });

// 1. Copiar frontend/public-web al root de dist-pages
if (fs.existsSync(publicWebDir)) {
  fs.cpSync(publicWebDir, distPagesDir, { recursive: true });
  console.log('✅ Copiado: frontend/public-web -> dist-pages/');
} else {
  console.error('❌ Error: No se encontró frontend/public-web');
}

// 2. Copiar frontend/admin-dashboard/dist a dist-pages/admin
if (fs.existsSync(adminDistDir)) {
  fs.cpSync(adminDistDir, path.join(distPagesDir, 'admin'), { recursive: true });
  console.log('✅ Copiado: frontend/admin-dashboard/dist -> dist-pages/admin/');
} else {
  console.warn('⚠️ Advertencia: No se encontró frontend/admin-dashboard/dist');
}

// 3. Copiar frontend/driver-app/dist a dist-pages/chofer
if (fs.existsSync(driverDistDir)) {
  fs.cpSync(driverDistDir, path.join(distPagesDir, 'chofer'), { recursive: true });
  console.log('✅ Copiado: frontend/driver-app/dist -> dist-pages/chofer/');
} else {
  console.warn('⚠️ Advertencia: No se encontró frontend/driver-app/dist');
}

// 4. Copiar APK si existe compilado
const apkTarget = path.join(distPagesDir, 'apk', 'TransportesLaSolucion-Chofer.apk');
if (fs.existsSync(apkSource)) {
  fs.copyFileSync(apkSource, apkTarget);
  console.log('✅ Copiado APK compilado -> dist-pages/apk/TransportesLaSolucion-Chofer.apk');
} else {
  console.log('ℹ️ APK nativo no compilado localmente; en CI/CD se genera con Gradle.');
}

// 5. Crear archivo .nojekyll
fs.writeFileSync(path.join(distPagesDir, '.nojekyll'), '');
console.log('✅ Creado: dist-pages/.nojekyll');

console.log('🎉 Ensamblaje completado con éxito en: ' + distPagesDir);
