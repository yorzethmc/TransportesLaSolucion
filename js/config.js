/**
 * Configuración global del sistema "Transportes La Solución"
 */
const APP_CONFIG = {
  // Números telefónicos de enrutamiento WhatsApp (formato internacional sin signos)
  PROD_PHONE: '50672094457', // Álvaro Scott (Producción)
  TEST_PHONE: '50687292124', // Modo Tester QA

  // Reglas de negocio
  MAX_PASSENGERS: 11,
  MIN_ADULTS: 1,

  // Feature Flag: Modo Tester en memoria
  TESTER_TRIGGER_ID: 'logoContainer',
  TESTER_TAPS_REQUIRED: 10,
  TESTER_WINDOW_MS: 3500,

  // Geocodificación y navegación
  NOMINATIM_URL: 'https://nominatim.openstreetmap.org/reverse'
};
