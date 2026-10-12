# Especificación de Sincronización Offline — V1.1

**Proyecto:** Transportes La Solución  
**Garantía:** Cero pérdida de datos GPS por desconexión en zonas montañosas o rurales (Poás, Bajos del Toro, etc.).

---

## 1. Ciclo de Vida de un Evento de Telemetría

1. **Captura:** Sensor GPS satelital obtiene lat/lng/accuracy.
2. **Generación de ID:** Se genera `deviceEventId` único (UUID o timestamp-hash).
3. **Persistencia Inmediata:** Se almacena en la cola local con estado `pending`.
4. **Intento de Transmisión:**
   - Si existe red: Se envía lote de hasta 50 eventos a la RPC `ingest_gps_batch_v2`.
   - Si no existe red o falla: Se marca con estado `failed`, se incrementa `retryCount` y se aplica backoff exponencial (3s, 6s, 12s, 24s... hasta 120s máx).
5. **Confirmación del Servidor:**
   - Al recibir acuse del servidor (`accepted_count > 0` o `duplicate_count > 0`), el evento se marca como `confirmed`.
   - Eventos confirmados se conservan 24 horas y luego se purgan localmente para ahorrar espacio.
6. **Límite de Seguridad:** Límite máximo de 5,000 eventos en búfer local (~17 días continuos de turno sin conexión).
