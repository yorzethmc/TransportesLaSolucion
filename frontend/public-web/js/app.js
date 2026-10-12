/**
 * Controlador Principal de la Aplicación "Transportes La Solución"
 */
document.addEventListener("DOMContentLoaded", () => {
  // Inicialización del Feature Flag Tester QA en el logo
  TesterModule.init(APP_CONFIG.TESTER_TRIGGER_ID);

  // ==========================================
  // MODAL CONTROLLER
  // ==========================================
  const modal = document.getElementById('modal');
  const overlay = document.getElementById('overlay');
  const btnOpenModal = document.getElementById('btnOpenModal');
  const btnCloseModal = document.getElementById('btnCloseModal');

  const openModal = () => {
    modal.classList.add('active');
    overlay.classList.add('active');
  };

  const closeModal = () => {
    modal.classList.remove('active');
    overlay.classList.remove('active');
  };

  if (btnOpenModal) btnOpenModal.addEventListener('click', openModal);
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', closeModal);

  // ==========================================
  // CONTROL DE FECHA MÍNIMA (Hoy en adelante)
  // ==========================================
  const dateInput = document.getElementById('date');
  if (dateInput) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    dateInput.min = today;
    dateInput.value = today;
  }

  // ==========================================
  // LÓGICA DE DESTINOS DINÁMICOS
  // ==========================================
  const destGroup = document.getElementById('destinationGroup');
  const nicGroup = document.getElementById('nicaraguaDestinations');
  const nicCity = document.getElementById('nicaraguaCity');
  const otherGroup = document.getElementById('otherDestination');
  const otherDestText = document.getElementById('otherDestText');

  const checkDestinations = () => {
    const val = destGroup.value;
    const nicVal = nicCity ? nicCity.value : '';

    if (nicGroup) {
      nicGroup.style.display = val === 'Nicaragua' ? 'block' : 'none';
    }
    if (nicCity) {
      nicCity.required = (val === 'Nicaragua');
    }

    if (val === 'Otro' || (val === 'Nicaragua' && nicVal === 'Otro')) {
      if (otherGroup) otherGroup.style.display = 'block';
      if (otherDestText) otherDestText.required = true;
    } else {
      if (otherGroup) otherGroup.style.display = 'none';
      if (otherDestText) otherDestText.required = false;
    }
  };

  if (destGroup) destGroup.addEventListener('change', checkDestinations);
  if (nicCity) nicCity.addEventListener('change', checkDestinations);

  // ==========================================
  // CONTROL DE PASAJEROS (Máximo 11 combinado)
  // ==========================================
  let adultsCount = 1;
  let minorsCount = 0;

  const updateCounters = () => {
    const valAdultsEl = document.getElementById('valAdults');
    const valMinorsEl = document.getElementById('valMinors');
    const btnSubAdults = document.getElementById('btnSubAdults');
    const btnSubMinors = document.getElementById('btnSubMinors');
    const btnAddAdults = document.getElementById('btnAddAdults');
    const btnAddMinors = document.getElementById('btnAddMinors');
    const cardAdults = document.getElementById('cardAdults');
    const cardMinors = document.getElementById('cardMinors');

    if (valAdultsEl) valAdultsEl.textContent = adultsCount;
    if (valMinorsEl) valMinorsEl.textContent = minorsCount;

    if (btnSubAdults) btnSubAdults.disabled = adultsCount <= APP_CONFIG.MIN_ADULTS;
    if (btnSubMinors) btnSubMinors.disabled = minorsCount <= 0;

    const canAdd = (adultsCount + minorsCount) < APP_CONFIG.MAX_PASSENGERS;
    if (btnAddAdults) btnAddAdults.disabled = !canAdd;
    if (btnAddMinors) btnAddMinors.disabled = !canAdd;

    if (cardAdults) cardAdults.classList.toggle('active', adultsCount > 0);
    if (cardMinors) cardMinors.classList.toggle('active', minorsCount > 0);
  };

  const triggerLimitFeedback = (btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.classList.remove('shake');
    void btn.offsetWidth;
    btn.classList.add('shake');
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  const btnAddAdults = document.getElementById('btnAddAdults');
  const btnSubAdults = document.getElementById('btnSubAdults');
  const btnAddMinors = document.getElementById('btnAddMinors');
  const btnSubMinors = document.getElementById('btnSubMinors');

  if (btnAddAdults) {
    btnAddAdults.addEventListener('click', () => {
      if ((adultsCount + minorsCount) < APP_CONFIG.MAX_PASSENGERS) {
        adultsCount++;
        updateCounters();
      } else {
        triggerLimitFeedback('btnAddAdults');
      }
    });
  }

  if (btnSubAdults) {
    btnSubAdults.addEventListener('click', () => {
      if (adultsCount > APP_CONFIG.MIN_ADULTS) {
        adultsCount--;
        updateCounters();
      }
    });
  }

  if (btnAddMinors) {
    btnAddMinors.addEventListener('click', () => {
      if ((adultsCount + minorsCount) < APP_CONFIG.MAX_PASSENGERS) {
        minorsCount++;
        updateCounters();
      } else {
        triggerLimitFeedback('btnAddMinors');
      }
    });
  }

  if (btnSubMinors) {
    btnSubMinors.addEventListener('click', () => {
      if (minorsCount > 0) {
        minorsCount--;
        updateCounters();
      }
    });
  }

  updateCounters();

  // ==========================================
  // MÓDULO DE CAPTURA GPS
  // ==========================================
  const locationBtn = document.getElementById('locationBtn');
  const locationSuccess = document.getElementById('locationSuccess');
  const gpsHint = document.getElementById('gpsHint');

  if (locationBtn) {
    locationBtn.addEventListener('click', () => {
      GeoModule.capturePosition(
        // onStart
        () => {
          locationBtn.disabled = true;
          locationBtn.innerHTML = `
            <svg class="spin-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <span>Fijando ubicación...</span>
          `;
        },
        // onSuccess
        () => {
          locationBtn.style.display = "none";
          if (gpsHint) gpsHint.style.display = "none";
          if (locationSuccess) locationSuccess.style.display = "flex";
        },
        // onError
        () => {
          locationBtn.disabled = false;
          locationBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg>
            <span>Reintentar fijar GPS</span>
          `;
        }
      );
    });
  }

  // ==========================================
  // ENVÍO DE FORMULARIO Y TICKET DE WHATSAPP
  // ==========================================
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) {
    bookingForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = document.getElementById('name').value.trim();
      const phone1 = document.getElementById('phone1').value.trim();
      const luggage = document.getElementById('hasLuggage').checked ? 'Sí' : 'No';

      const [y, m, d] = dateInput.value.split('-');
      const dateStr = `${d}/${m}/${y}`;

      const cleanPhone1 = phone1.replace(/\D/g, '');
      const waClientLink = `https://wa.me/${cleanPhone1.length === 8 ? '506' + cleanPhone1 : cleanPhone1}`;

      // Formateo del Destino
      let finalDest = destGroup.value;
      if (finalDest === 'Nicaragua') {
        const cityVal = nicCity ? nicCity.value : '';
        const customText = otherDestText ? otherDestText.value.trim() : '';
        finalDest = `Nicaragua (${cityVal === 'Otro' ? customText : cityVal})`;
      } else if (finalDest === 'Otro') {
        finalDest = otherDestText ? otherDestText.value.trim() : 'Otro';
      }

      // Datos de Geolocalización
      const userCoords = GeoModule.getCoords();
      const internalGeoData = GeoModule.getAddress();

      let coordsLine = 'No capturadas';
      let navLines = '• Enlaces no disponibles (sin GPS)';

      if (userCoords) {
        const accText = userCoords.accuracy ? ` (±${Math.round(userCoords.accuracy)}m)` : '';
        coordsLine = `${userCoords.lat.toFixed(6)}, ${userCoords.lng.toFixed(6)}${accText}`;
        navLines = `• Waze: https://waze.com/ul?ll=${userCoords.lat},${userCoords.lng}&navigate=yes\n• Google Maps: https://www.google.com/maps?q=${userCoords.lat},${userCoords.lng}`;
      }

      const addressLine = internalGeoData || (userCoords ? 'Coordenadas capturadas (sin geocodificación)' : 'No compartida');
      const manualLocEl = document.getElementById('manualLocation');
      const senias = manualLocEl ? manualLocEl.value.trim() : '';

      // Construcción del Ticket Enriquecido de WhatsApp
      const isTest = TesterModule.isActive();
      const headerText = isTest ? '[TEST / SIMULACIÓN DE SISTEMA]\n\n' : '';

      const msg = `${headerText}*🚐 SOLICITUD DE VIAJE - LA SOLUCIÓN*

*👤 INFO DEL CLIENTE*
• Nombre: ${name}
• Teléfono: ${phone1}
• WhatsApp: ${waClientLink}

*🧳 DETALLES DEL VIAJE*
• Destino: ${finalDest}
• Fecha: ${dateStr}
• Pasajeros: ${adultsCount} Adulto(s), ${minorsCount} Niño(s)
• Equipaje: ${luggage}

*📍 PUNTO DE RECOLECCIÓN*
• Dirección: ${addressLine}
• Coordenadas: ${coordsLine}
• Señas: ${senias || 'Sin señas adicionales'}

*🧭 NAVEGACIÓN CHOFER*
${navLines}`;

      const targetPhone = isTest ? APP_CONFIG.TEST_PHONE : APP_CONFIG.PROD_PHONE;
      const waUrl = `https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`;

      // Despacho mediante window.location.href (evita bloqueo de popups en navegadores móviles)
      window.location.href = waUrl;
    });
  }
});
