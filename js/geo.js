/**
 * Módulo de Geolocalización de Alta Precisión y Geocodificación Detallada
 * Integra convergencia satelital por watchPosition y extracción multinivel (OSM).
 */
const GeoModule = (() => {
  let userCoords = null;
  let internalGeoData = "";

  /**
   * Resuelve la dirección jerárquica detallada sin omitir parques industriales,
   * caseríos, residenciales ni comercios (e.g. Zona Franca Coyol, Llanos del Coyol, etc.)
   */
  const resolveDetailedAddress = async (coords) => {
    try {
      const url = `${APP_CONFIG.NOMINATIM_URL}?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'es' }
      });
      if (!res.ok) return;

      const data = await res.json();
      const addr = data.address || {};

      // 1. País, Provincia, Cantón y Distrito (Estructura oficial establecida)
      const countryName = addr.country || 'Costa Rica';
      const provinceName = addr.state || '';
      const cantonName = addr.county || addr.municipality || '';
      const districtName = addr.district || addr.suburb || addr.village || addr.town || addr.city || '';

      // 2. Lugares específicos, polígonos industriales, zonas francas, condominios y comercios
      const placeNames = [
        addr.industrial,     // Ej: "Zona Franca Coyol"
        addr.neighbourhood,  // Ej: "Llanos del Coyol" o "El Coyol"
        addr.residential,    // Ej: "Condominio Royal Palm"
        addr.building,
        addr.amenity,
        addr.hamlet,
        addr.road ? (addr.road + (addr.house_number ? ` #${addr.house_number}` : '')) : null
      ].filter(Boolean);

      const specificDetails = [...new Set(placeNames)].filter(p => 
        p.toLowerCase() !== districtName.toLowerCase() && 
        p.toLowerCase() !== cantonName.toLowerCase() && 
        p.toLowerCase() !== provinceName.toLowerCase()
      ).join(', ');

      // 3. Orden estricto establecido: País -> Provincia -> Cantón -> Distrito -> Detalle
      const hierarchy = [
        countryName,
        provinceName,
        cantonName,
        districtName,
        specificDetails
      ].filter(Boolean);

      if (hierarchy.length > 0) {
        internalGeoData = hierarchy.join(', ');
      } else if (data.display_name) {
        internalGeoData = data.display_name;
      }
    } catch (_e) {
      // Proceso silencioso: preserva coordenadas crudas para los deep links
    }
  };

  /**
   * Inicia la captura de ubicación mediante escucha satelital convergente.
   */
  const capturePosition = (onStart, onSuccess, onError) => {
    if (!navigator.geolocation) {
      onError();
      return;
    }

    onStart();

    let bestPosition = null;
    let watchId = null;
    let convergenceTimeout = null;

    const finalize = (pos) => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (convergenceTimeout !== null) {
        clearTimeout(convergenceTimeout);
        convergenceTimeout = null;
      }

      userCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy
      };

      onSuccess(userCoords);
      resolveDetailedAddress(userCoords);
    };

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!bestPosition || pos.coords.accuracy < bestPosition.coords.accuracy) {
            bestPosition = pos;
          }
          // Bloqueo satelital de alta precisión (≤ 25 metros)
          if (pos.coords.accuracy <= 25) {
            finalize(pos);
          }
        },
        () => {
          if (bestPosition) finalize(bestPosition);
          else onError();
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );

      // Si tras 3.5 segundos aún no baja de 25m, finaliza con la mejor captura disponible
      convergenceTimeout = setTimeout(() => {
        if (bestPosition) {
          finalize(bestPosition);
        }
      }, 3500);
    } catch (_err) {
      navigator.geolocation.getCurrentPosition(
        finalize,
        onError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  return {
    capturePosition,
    getCoords: () => userCoords,
    getAddress: () => internalGeoData
  };
})();
