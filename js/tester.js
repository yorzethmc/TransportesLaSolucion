/**
 * Módulo de Modo Tester QA en Memoria
 * Se activa tras 10 toques en 3.5s sobre el logo de la aplicación.
 * Conmuta el enrutamiento telefónico a TEST_PHONE y activa la cabecera de simulación.
 */
const TesterModule = (() => {
  let isTestMode = false;
  let testerTaps = 0;
  let testerTimer = null;

  const init = (targetElementId) => {
    const el = document.getElementById(targetElementId);
    if (!el) return;

    el.addEventListener('click', () => {
      testerTaps++;
      if (testerTaps === 1) {
        clearTimeout(testerTimer);
        testerTimer = setTimeout(() => {
          testerTaps = 0;
        }, APP_CONFIG.TESTER_WINDOW_MS);
      } else if (testerTaps >= APP_CONFIG.TESTER_TAPS_REQUIRED) {
        clearTimeout(testerTimer);
        testerTaps = 0;
        isTestMode = !isTestMode;
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      }
    });
  };

  return {
    init,
    isActive: () => isTestMode
  };
})();
