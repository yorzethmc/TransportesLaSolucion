# Evaluación Técnica: Google Nearby Connections vs Wi-Fi Direct — V1.1

**Proyecto:** Transportes La Solución  
**Módulo:** Conectividad Experimental Entre Dispositivos (Store-and-Forward Vehicular).

---

## 1. Comparativa Técnica

| Criterio | Google Nearby Connections API | Wi-Fi Direct (P2P Android Nativo) |
| :--- | :--- | :--- |
| **Descubrimiento de Pares** | Híbrido y automático (BLE / Bluetooth Clásico). No requiere intervención del chofer. | Requiere escaneo Wi-Fi activo continuo y consumo alto de energía. |
| **Establecimiento de Conexión** | Negociación automática transparente con cifrado AES-256 simétrico de sesión. | Requiere creación de Wi-Fi P2P Group y cuadros de diálogo del sistema en Android. |
| **Traspaso de Red (Handover)** | Eleva la conexión a Wi-Fi Hotspot / Wi-Fi Direct automáticamente para transferir datos. | Manual o propenso a desconexiones al alternar con datos celulares. |
| **Ergonomía al Volante** | **Cero fricción:** Los teléfonos se descubren y transmiten en segundo plano mientras los choferes cruzan rutas. | Inviable al volante: interrumpiría al conductor solicitando confirmaciones en pantalla. |
| **Compatibilidad** | Google Play Services (disponible en prácticamente el 100% de Android en Costa Rica). | Nativo Android Framework. |

---

## 2. Decisión Técnica Arquitectónica

**Opción Seleccionada:** **Google Nearby Connections API** (Estrategia P2P_CLUSTER / P2P_STAR).

### Justificación:
1. **Seguridad Operativa:** Un conductor conduciendo una buseta en Poás no puede distraerse aceptando conexiones Wi-Fi en pantalla. Nearby Connections permite emparejamiento automático por token criptográfico pre-compartido entre dispositivos registrados en `driver_devices`.
2. **Topología Dinámica:** Cuando dos busetas se cruzan en un cruce vial o terminal, la ventana de contacto puede ser de solo 30 a 60 segundos. Nearby Connections descubre vía Bluetooth LE de bajo consumo y transfiere los paquetes pendientes de telemetría a alta velocidad mediante Wi-Fi Direct temporal sin desconectar la red celular del dispositivo receptor.

---

## 3. Algoritmo de Selección de Gateway

```
Score = (HasInternet * 50) + (BatteryLevel * 25) + (QueueLoadFactor * 15) + (ContactFreshness * 10)
```
- **Prioridad 1:** Conexión a Internet celular propia.
- **Prioridad 2:** Peer cercano con `Score > 65` (con Internet y batería > 15%).
- **Prioridad 3:** Almacenamiento en cola SQLite local hasta recuperar señal.
