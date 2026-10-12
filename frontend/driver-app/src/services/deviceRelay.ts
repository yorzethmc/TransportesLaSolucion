import type { DeviceRelayEvent } from '@transportes-la-solucion/types';
import { OfflineQueueService } from './offlineQueue.js';

export interface NearbyPeer {
  deviceId: string;
  driverId: string;
  hasInternet: boolean;
  batteryLevel: number;
  pendingCount: number;
  lastSeenAt: number;
}

export class DeviceRelayService {
  private static MAX_HOPS = 2;
  private static MAX_CUSTODY_HOURS = 48;

  /**
   * Calcula el puntaje de aptitud (Gateway Score) de un dispositivo para actuar como retransmisor hacia Supabase.
   * Rango: 0 a 100 puntos.
   */
  public static calculateGatewayScore(peer: NearbyPeer): number {
    let score = 0;

    // 1. Acceso a Internet (Factor crítico: 50 pts)
    if (peer.hasInternet) score += 50;

    // 2. Nivel de batería (Hasta 25 pts)
    score += Math.round(Math.max(0, Math.min(1, peer.batteryLevel)) * 25);

    // 3. Carga de cola local (Menos eventos pendientes = mayor capacidad: hasta 15 pts)
    if (peer.pendingCount < 10) score += 15;
    else if (peer.pendingCount < 50) score += 8;

    // 4. Frescura de contacto (Últimos 60 segundos: 10 pts)
    if (Date.now() - peer.lastSeenAt < 60_000) score += 10;

    return score;
  }

  /**
   * Selecciona el mejor nodo de enlace disponible.
   * Si no hay peers con internet o el dispositivo local tiene internet, se prioriza la conexión directa.
   */
  public static selectBestGateway(localInternet: boolean, nearbyPeers: NearbyPeer[]): NearbyPeer | null {
    if (localInternet || nearbyPeers.length === 0) {
      return null; // Prioridad 1: Internet propio
    }

    const eligible = nearbyPeers
      .filter((p) => p.hasInternet && p.batteryLevel > 0.15)
      .map((p) => ({ peer: p, score: this.calculateGatewayScore(p) }))
      .sort((a, b) => b.score - a.score);

    return eligible.length > 0 ? eligible[0].peer : null;
  }

  /**
   * Empaqueta eventos locales en un sobre de relay para ser entregado a un chofer cercano.
   */
  public static createRelayEnvelope(
    originDeviceId: string,
    relayDeviceId: string,
    rawPayload: string
  ): DeviceRelayEvent {
    return {
      id: `relay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originDeviceId,
      relayDeviceId,
      deviceEventId: `evt-${Date.now()}`,
      payloadEncrypted: btoa(rawPayload), // Simulación de cifrado de sobre cerrado
      signature: `sig-${Date.now()}`,
      hopCount: 1,
      status: 'received',
      receivedAt: new Date().toISOString(),
    };
  }

  /**
   * Procesa un sobre recibido de otro vehículo: si tenemos internet, lo despachamos al backend.
   */
  public static async processIncomingRelay(envelope: DeviceRelayEvent): Promise<boolean> {
    if (envelope.hopCount >= this.MAX_HOPS) {
      console.warn(`Sobre rechazado: excedió el límite de ${this.MAX_HOPS} saltos.`);
      return false;
    }

    // Verificar si el sobre no ha superado el tiempo de custodia (48 horas)
    const ageHours = (Date.now() - Date.parse(envelope.receivedAt)) / 3_600_000;
    if (ageHours > this.MAX_CUSTODY_HOURS) {
      console.warn('Sobre expirado (más de 48 horas de custodia). Descartando.');
      return false;
    }

    return true;
  }
}
