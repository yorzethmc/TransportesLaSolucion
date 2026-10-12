import type { GpsLocationSample } from '@transportes-la-solucion/types';
import { OfflineQueueService } from './offlineQueue.js';
import type { TransportesApiClient } from '@transportes-la-solucion/api-client';

export interface TrackingOptions {
  driverId: string;
  vehicleId: string;
  tripId?: string | null;
  intervalMs?: number;
}

export class GpsTrackingService {
  private static timerId: number | null = null;
  private static isRunning = false;
  private static options: TrackingOptions | null = null;
  private static apiClient: TransportesApiClient | null = null;

  public static initialize(client: TransportesApiClient): void {
    this.apiClient = client;
  }

  public static isTrackingActive(): boolean {
    return this.isRunning;
  }

  /**
   * Inicia la captura periódica de GPS en primer plano / segundo plano.
   */
  public static startTracking(options: TrackingOptions): void {
    if (this.isRunning) return;

    this.options = options;
    this.isRunning = true;
    const interval = options.intervalMs || 300_000; // 5 minutos por defecto

    // 1. Captura inmediata al iniciar turno
    this.captureSingleSample();

    // 2. Intervalo periódico adaptativo
    this.timerId = window.setInterval(() => {
      this.captureSingleSample();
    }, interval);
  }

  /**
   * Detiene el seguimiento GPS al finalizar el turno.
   */
  public static stopTracking(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
    this.options = null;
  }

  /**
   * Realiza una captura satelital, la guarda de inmediato en SQLite/Storage y luego intenta sincronizar.
   */
  public static async captureSingleSample(): Promise<void> {
    if (!this.options || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // Nivel de batería si la API está disponible
        let batteryLevel: number | null = null;
        try {
          if ('getBattery' in navigator) {
            const b = await (navigator as any).getBattery();
            batteryLevel = b.level;
          }
        } catch (_e) {}

        const sample: GpsLocationSample = {
          deviceEventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          driverId: this.options!.driverId,
          vehicleId: this.options!.vehicleId,
          tripId: this.options!.tripId || null,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
          speedMps: pos.coords.speed || 0.0,
          headingDegrees: pos.coords.heading || 0.0,
          altitudeMeters: pos.coords.altitude || null,
          batteryLevel,
          provider: 'fused',
          isMocked: false,
          capturedAt: new Date(pos.timestamp).toISOString(),
        };

        // 1. PERSISTENCIA LOCAL OBLIGATORIA
        await OfflineQueueService.enqueue(sample);

        // 2. DISPARAR SINCRONIZACIÓN PERSISTENTE SI HAY CONECTIVIDAD
        await this.syncPendingQueue();
      },
      (err) => {
        console.warn('Error al capturar posición satelital:', err.message);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  /**
   * Envía eventos acumulados en la cola local hacia Supabase por lotes.
   */
  public static async syncPendingQueue(): Promise<void> {
    if (!this.apiClient || !navigator.onLine) return;

    try {
      const batch = await OfflineQueueService.getBatchForSync(50);
      if (batch.length === 0) return;

      const eventIds = batch.map((b) => b.deviceEventId);
      await OfflineQueueService.markSending(eventIds);

      const samples = batch.map((b) => b.sample);
      const res = await this.apiClient.uploadGpsBatchV2(samples);

      if (res.acceptedCount > 0 || res.duplicateCount > 0) {
        await OfflineQueueService.markConfirmed(eventIds);
      } else if (res.rejectedCount > 0) {
        await OfflineQueueService.markFailed(eventIds, 'Rechazado por servidor');
      }
    } catch (e: any) {
      console.warn('Fallo en sincronización GPS (se reintentará con backoff):', e.message);
    }
  }
}
