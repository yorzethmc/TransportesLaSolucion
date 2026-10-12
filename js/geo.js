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

      // 1. Lugares específicos, polígonos industriales, zonas francas, condominios y comercios
      const placeNames = [
        addr.industrial,     // Ej: "Zona Franca Coyol"
        addr.amenity,        // Ej: Nombre de empresa, hospital, escuela
        addr.office,         // Ej: Oficinas corporativas
        addr.commercial,     // Ej: Centro comercial
        addr.residential,    // Ej: "Condominio Royal Palm"
        addr.building,       // Ej: Nombre del edificio
        addr.neighbourhood,  // Ej: "Llanos del Coyol" o "El Coyol"
        addr.suburb,         // Ej: "El Coyol"
        addr.hamlet,         // Ej: Caseríos rurales
        addr.quarter,
        addr.locality
      ].filter(Boolean);

      // 2. Vía exacta con número de inmueble
      const roadNames = [
        addr.road || addr.pedestrian || addr.highway || addr.path,
        addr.house_number ? `#${addr.house_number}` : null
      ].filter(Boolean);

      // 3. Distrito / Poblado / Ciudad
      const districtNames = [
        addr.district,
        addr.village,
        addr.town,
        addr.city
      ].filter(Boolean);

      // 4. Cantón y Provincia
      const cantonName = addr.county || addr.municipality || '';
      const provinceName = addr.state || '';

      const elements = [];

      if (placeNames.length > 0) {
        const uniquePlaces = [...new Set(placeNames)];
        elements.push(uniquePlaces.join(', '));
      }

      if (roadNames.length > 0) {
        const roadStr = roadNames.join(' ');
        if (!elements.some(el => el.toLowerCase().includes(roadStr.toLowerCase()))) {
          elements.push(roadStr);
        }
      }

      if (districtNames.length > 0) {
        const distStr = districtNames[0];
        if (!elements.some(el => el.toLowerCase().includes(distStr.toLowerCase()))) {
          elements.push(distStr);
        }
      }

      if (cantonName && !elements.some(el => el.toLowerCase().includes(cantonName.toLowerCase()))) {
        elements.push(cantonName);
      }

      if (provinceName && !elements.some(el => el.toLowerCase().includes(provinceName.toLowerCase()))) {
        elements.push(provinceName);
      }

      if (elements.length >= 2) {
        internalGeoData = elements.join(', ');
      } else if (data.display_name) {
        // Fallback limpio eliminando códigos postales y 'Costa Rica'
        internalGeoData = data.display_name
          .split(',')
          .map(s => s.trim())
          .filter(s => s && s.toLowerCase() !== 'costa rica' && !/^\d{4,5}$/.test(s))
          .join(', ');
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
