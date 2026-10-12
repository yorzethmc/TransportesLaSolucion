import type { GpsLocationSample } from '@transportes-la-solucion/types';

export type QueueEventStatus = 'pending' | 'sending' | 'uploaded' | 'confirmed' | 'failed' | 'expired';

export interface QueuedGpsEvent {
  deviceEventId: string;
  sample: GpsLocationSample;
  status: QueueEventStatus;
  retryCount: number;
  lastAttemptAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

const STORAGE_KEY = 'tls_driver_offline_gps_queue';
const MAX_LOCAL_RECORDS = 5000;

export class OfflineQueueService {
  private static getStoredQueue(): QueuedGpsEvent[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_e) {
      return [];
    }
  }

  private static saveQueue(queue: QueuedGpsEvent[]): void {
    try {
      // Limitar tamaño de la cola local para no agotar almacenamiento
      const trimmed = queue.slice(-MAX_LOCAL_RECORDS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.error('Error al guardar en cola local persistente:', e);
    }
  }

  /**
   * Encola una muestra GPS de forma inmediata antes de cualquier intento de red.
   */
  public static async enqueue(sample: GpsLocationSample): Promise<void> {
    const queue = this.getStoredQueue();
    
    // Evitar duplicados por deviceEventId
    if (queue.some((e) => e.deviceEventId === sample.deviceEventId)) {
      return;
    }

    queue.push({
      deviceEventId: sample.deviceEventId,
      sample,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });

    this.saveQueue(queue);
  }

  /**
   * Obtiene eventos listos para transmisión (status 'pending' o 'failed' con reintento cumplido).
   */
  public static async getBatchForSync(limit = 50): Promise<QueuedGpsEvent[]> {
    const queue = this.getStoredQueue();
    const now = Date.now();

    const readyEvents = queue.filter((e) => {
      if (e.status === 'confirmed') return false;
      if (e.status === 'pending') return true;
      if (e.status === 'failed') {
        // Backoff exponencial: 3s, 6s, 12s, 24s... hasta máx 120s
        const backoffMs = Math.min(120_000, 3_000 * Math.pow(2, e.retryCount));
        const lastAttempt = e.lastAttemptAt ? Date.parse(e.lastAttemptAt) : 0;
        return now - lastAttempt >= backoffMs;
      }
      return false;
    });

    return readyEvents.slice(0, limit);
  }

  public static async markSending(eventIds: string[]): Promise<void> {
    const queue = this.getStoredQueue();
    for (const item of queue) {
      if (eventIds.includes(item.deviceEventId)) {
        item.status = 'sending';
        item.lastAttemptAt = new Date().toISOString();
      }
    }
    this.saveQueue(queue);
  }

  public static async markConfirmed(eventIds: string[]): Promise<void> {
    let queue = this.getStoredQueue();
    // Marcar como confirmado
    for (const item of queue) {
      if (eventIds.includes(item.deviceEventId)) {
        item.status = 'confirmed';
      }
    }
    // Depurar confirmados que tengan más de 24 horas para liberar espacio
    const oneDayAgo = Date.now() - 86_400_000;
    queue = queue.filter((item) => {
      if (item.status === 'confirmed') {
        return Date.parse(item.createdAt) >= oneDayAgo;
      }
      return true;
    });

    this.saveQueue(queue);
  }

  public static async markFailed(eventIds: string[], errorMessage: string): Promise<void> {
    const queue = this.getStoredQueue();
    for (const item of queue) {
      if (eventIds.includes(item.deviceEventId)) {
        item.status = 'failed';
        item.retryCount += 1;
        item.errorMessage = errorMessage;
        item.lastAttemptAt = new Date().toISOString();
      }
    }
    this.saveQueue(queue);
  }

  public static async getStats(): Promise<{ pendingCount: number; totalCount: number; lastSyncAt: string | null }> {
    const queue = this.getStoredQueue();
    const pending = queue.filter((e) => e.status === 'pending' || e.status === 'failed' || e.status === 'sending');
    const lastConfirmed = queue
      .filter((e) => e.status === 'confirmed' && e.lastAttemptAt)
      .sort((a, b) => Date.parse(b.lastAttemptAt!) - Date.parse(a.lastAttemptAt!))[0];

    return {
      pendingCount: pending.length,
      totalCount: queue.length,
      lastSyncAt: lastConfirmed?.lastAttemptAt || null,
    };
  }
}
