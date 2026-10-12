/**
 * INTEGRACIÓN DE NAVEGACIÓN Y COMUNICACIÓN EXTERNA
 * Permite al conductor abrir Waze, Google Maps, llamadas telefónicas y WhatsApp con un solo toque.
 */

export class ExternalNavigationService {
  /**
   * Abre Waze directamente con el destino fijado y navegación asistida activada.
   */
  public static openWaze(latitude: number, longitude: number): void {
    const url = `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
    window.open(url, '_system');
  }

  /**
   * Abre Google Maps con modo de navegación ruta directa.
   */
  public static openGoogleMaps(latitude: number, longitude: number): void {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    window.open(url, '_system');
  }

  /**
   * Dispara el marcador nativo del teléfono para llamar al pasajero o a la central.
   */
  public static callPhone(phoneNumber: string): void {
    const clean = phoneNumber.replace(/\D/g, '');
    window.location.href = `tel:${clean}`;
  }

  /**
   * Abre chat de WhatsApp directo con el cliente.
   */
  public static openWhatsApp(phoneNumber: string, message = ''): void {
    const clean = phoneNumber.replace(/\D/g, '');
    const encodedMsg = encodeURIComponent(message);
    const url = `https://wa.me/${clean}${message ? `?text=${encodedMsg}` : ''}`;
    window.open(url, '_system');
  }
}
