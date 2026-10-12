/**
 * CONSTANTES DE CONFIGURACIÓN Y POLÍTICAS OPERATIVAS
 * Transportes La Solución - V1
 */

export const APP_CONFIG = {
  COMPANY_NAME: 'Transportes La Solución',
  DEFAULT_COUNTRY: 'Costa Rica',
  DEFAULT_CURRENCY: 'CRC',
  SUPPORT_PHONE: '50672094457',

  // Límites operativos iniciales
  INITIAL_FLEET_LIMITS: {
    MAX_ACTIVE_DRIVERS_DAILY: 10,
    MAX_DAILY_OPERATION_HOURS: 12,
  },

  // Estrategia GPS Adaptativa
  GPS: {
    // Intervalo estándar solicitado: ~5 minutos (300,000 ms)
    STANDARD_INTERVAL_MS: 300_000,
    // Intervalo en espera (sin viaje activo y detenido): 10 minutos
    IDLE_INTERVAL_MS: 600_000,
    // Intervalo de emergencia: 1 minuto
    EMERGENCY_INTERVAL_MS: 60_000,
    // Filtro de precisión satelital: ignorar puntos con error superior a 50 metros
    MAX_ACCEPTABLE_ACCURACY_METERS: 50,
    // Distancia mínima para considerar desplazamiento efectivo (evita ruido en parada)
    MIN_DISPLACEMENT_METERS: 30,
    // Velocidad máxima creíble en carretera para descartar saltos imposibles (150 km/h = 41.6 m/s)
    MAX_PLAUSIBLE_SPEED_MPS: 41.6,
  },

  // Modo Offline de la App de Conductor
  OFFLINE: {
    MAX_LOCAL_SAMPLES_BUFFER: 5_000,
    BATCH_SYNC_CHUNK_SIZE: 50,
    INITIAL_BACKOFF_DELAY_MS: 3_000,
    MAX_BACKOFF_DELAY_MS: 120_000,
  },

  // Retención de datos y cuotas de plan gratuito Supabase
  DATA_RETENTION: {
    LOCATION_HISTORY_DAYS: 90, // Purgar histórico GPS de más de 90 días a resúmenes
    AUDIT_LOGS_DAYS: 180,
  },

  // Estándar oficial Supabase 2026: Publishable & Secret Keys
  SUPABASE_KEYS: {
    HEADER_APIKEY: 'apikey',
    HEADER_AUTH: 'Authorization',
    BEARER_PREFIX: 'Bearer',
  },
} as const;
