# Arquitectura de la Aplicación Android (Driver App) — V1.1

**Proyecto:** Transportes La Solución  
**Módulo:** `apps/driver-app`  
**Tecnología:** React + TypeScript + Capacitor 6 + Kotlin Foreground Service.

---

## 1. Componentes Clave

```
[UI React Conductor]
       │
       ▼
[GpsTrackingService] ──> Cada ~5 minutos
       │
       ▼
[OfflineQueueService] ──> Persistencia local inmediata (SQLite / Storage)
       │
       ├── Si Online ──> [TransportesApiClient.uploadGpsBatchV2] ──> Supabase
       │
       └── Si Offline ──> Cola pendiente con Exponential Backoff
```

---

## 2. Ejecución con Pantalla Apagada (Foreground Service)
- **Servicio Nativo:** `GpsForegroundService.kt`.
- **Canal de Notificación:** `CHANNEL_ID = "tls_gps_tracking_channel"`.
- **Comportamiento:**
  - Se muestra notificación persistente obligatoria indicando seguimiento activo.
  - El sistema Android no suspende el proceso ni el hilo de captura mientras el turno permanezca activo.
  - Al finalizar turno, el servicio se detiene inmediatamente liberando recursos de batería.

---

## 3. Integración de Navegación Externa
- **Waze:** Deep link directo con coordenadas de recogida.
- **Google Maps:** Modo navegación asistida punto a punto.
- **Comunicaciones:** Intent `tel:` para llamada al pasajero y `wa.me/` para chat de coordinación.
