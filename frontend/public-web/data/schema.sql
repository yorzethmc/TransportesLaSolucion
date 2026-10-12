-- ========================================================================
-- SCHEMA DE BASE DE DATOS: TRANSPORTES LA SOLUCIÓN
-- Diseñado por: Agente DBA (Nivel: Gemini Pro)
-- Compatible con: PostgreSQL / Supabase (Soporta extensiones espaciales PostGIS)
-- ========================================================================

-- 1. TABLA DE CHOFERES Y UNIDADES OPERATIVAS
CREATE TABLE IF NOT EXISTS choferes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20) NOT NULL UNIQUE,
    unidad_placa VARCHAR(20),
    unidad_tipo VARCHAR(50) DEFAULT 'Buseta (11 Pax)',
    capacidad_pax INTEGER DEFAULT 11,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TELEMETRÍA EN TIEMPO REAL (GPS DE CHOFERES AL VOLANTE)
-- Esta tabla recibe pings cada 5-10 segundos desde la app móvil Android.
CREATE TABLE IF NOT EXISTS choferes_telemetria (
    chofer_id UUID PRIMARY KEY REFERENCES choferes(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    velocidad DOUBLE PRECISION DEFAULT 0.0,
    rumbo DOUBLE PRECISION DEFAULT 0.0,
    en_servicio BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SOLICITUDES DE VIAJE (ORIGINADAS EN LA WEB)
CREATE TABLE IF NOT EXISTS solicitudes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_nombre VARCHAR(150) NOT NULL,
    cliente_telefono VARCHAR(25) NOT NULL,
    fecha_viaje DATE NOT NULL,
    destino VARCHAR(150) NOT NULL,
    adultos_count INTEGER DEFAULT 1,
    ninos_count INTEGER DEFAULT 0,
    tiene_equipaje BOOLEAN DEFAULT FALSE,
    
    -- Ubicación y Geocodificación Estructurada
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    accuracy_m DOUBLE PRECISION,
    provincia VARCHAR(50),
    canton VARCHAR(50),      -- Ej: 'Poás', 'Alajuela', 'Grecia'
    distrito VARCHAR(50),    -- Ej: 'San Pedro', 'Carrillos', 'San Juan'
    direccion_texto TEXT,
    senias_manuales TEXT,
    
    -- Estado de la Solicitud
    estado VARCHAR(30) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'asignado', 'en_ruta', 'completado', 'cancelado')),
    chofer_asignado_id UUID REFERENCES choferes(id) ON DELETE SET NULL,
    orden_parada INTEGER DEFAULT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================================
-- ÍNDICES DE ALTO RENDIMIENTO PARA CONSULTAS Y AGRUPACIÓN
-- ========================================================================
CREATE INDEX IF NOT EXISTS idx_solicitudes_canton ON solicitudes(canton);
CREATE INDEX IF NOT EXISTS idx_solicitudes_fecha ON solicitudes(fecha_viaje);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_telemetria_coords ON choferes_telemetria(lat, lng);

-- ========================================================================
-- FUNCIÓN DE CÁLCULO DE PROXIMIDAD GEOESPACIAL (Fórmula de Haversine)
-- Encuentra pasajeros cercanos a un punto geográfico dado (ej. Poás) en un radio en Km
-- ========================================================================
CREATE OR REPLACE FUNCTION get_solicitudes_cercanas(
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_radio_km DOUBLE PRECISION DEFAULT 5.0
)
RETURNS TABLE (
    id UUID,
    cliente_nombre VARCHAR,
    cliente_telefono VARCHAR,
    canton VARCHAR,
    distrito VARCHAR,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distancia_km DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.cliente_nombre,
        s.cliente_telefono,
        s.canton,
        s.distrito,
        s.lat,
        s.lng,
        (6371 * acos(
            cos(radians(p_lat)) * cos(radians(s.lat)) *
            cos(radians(s.lng) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(s.lat))
        )) AS distancia_km
    FROM solicitudes s
    WHERE s.lat IS NOT NULL 
      AND s.lng IS NOT NULL
      AND s.estado = 'pendiente'
      AND (6371 * acos(
            cos(radians(p_lat)) * cos(radians(s.lat)) *
            cos(radians(s.lng) - radians(p_lng)) +
            sin(radians(p_lat)) * sin(radians(s.lat))
      )) <= p_radio_km
    ORDER BY distancia_km ASC;
END;
$$ LANGUAGE plpgsql;
