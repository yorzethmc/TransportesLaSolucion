import React, { useState, useEffect } from 'react';
import { TransportesApiClient } from '@transportes-la-solucion/api-client';
import type { AuthSessionUser } from '@transportes-la-solucion/types';
import { GpsTrackingService } from './services/gpsTrackingService.js';
import { OfflineQueueService } from './services/offlineQueue.js';
import { ExternalNavigationService } from './services/externalNavigation.js';

// Cliente configurado
const apiClient = new TransportesApiClient({
  supabaseUrl: (window as any).VITE_SUPABASE_URL || 'https://xyzcompany.supabase.co',
  supabasePublishableKey: (window as any).VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_dummy_for_build',
});

GpsTrackingService.initialize(apiClient);

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isShiftActive, setIsShiftActive] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncText, setLastSyncText] = useState('Sin sincronizar');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [showIncidentModal, setShowIncidentModal] = useState(false);

  // Viaje de demostración asignado para la interfaz operativa
  const [activeTrip, setActiveTrip] = useState({
    id: 'trip-demo-001',
    customerName: 'Roberto Solano',
    customerPhone: '50688889999',
    destination: 'San Pedro de Poás, Alajuela',
    pickupCoords: { lat: 10.0754, lng: -84.2441 },
    adults: 2,
    luggage: true,
    status: 'assigned', // 'assigned' | 'arrived' | 'in_progress' | 'completed'
  });

  // Actualizar estadísticas de la cola offline periódicamente
  useEffect(() => {
    const updateStats = async () => {
      const stats = await OfflineQueueService.getStats();
      setPendingSyncCount(stats.pendingCount);
      if (stats.lastSyncAt) {
        const time = new Date(stats.lastSyncAt).toLocaleTimeString();
        setLastSyncText(`Última: ${time}`);
      }
    };

    updateStats();
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // 1. INICIO DE SESIÓN POR TELÉFONO
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      // Login con teléfono normalizado (ej: 8888-8888 -> 50688888888)
      const res = await apiClient.signInWithPhone(phoneInput, passwordInput);
      setCurrentUser(res.user);
    } catch (err: any) {
      setLoginError(err.message || 'Error al iniciar sesión');
    }
  };

  // 2. CAMBIO OBLIGATORIO DE CONTRASEÑA
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await apiClient.getRawClient().auth.updateUser({
        password: newPasswordInput,
      });
      if (error) throw error;

      if (currentUser?.driverId) {
        await apiClient.getRawClient()
          .from('drivers')
          .update({ must_change_password: false })
          .eq('id', currentUser.driverId);
      }

      setCurrentUser((prev: AuthSessionUser | null) => prev ? { ...prev, mustChangePassword: false } : null);
    } catch (err: any) {
      alert(`Error al actualizar contraseña: ${err.message}`);
    }
  };

  // 3. INICIAR / FINALIZAR TURNO
  const toggleShift = () => {
    if (!isShiftActive) {
      setIsShiftActive(true);
      GpsTrackingService.startTracking({
        driverId: currentUser?.driverId || 'driver-local-id',
        vehicleId: 'vehicle-hiace-01',
        tripId: activeTrip.id,
      });
    } else {
      setIsShiftActive(false);
      GpsTrackingService.stopTracking();
    }
  };

  // 4. FORZAR SINCRONIZACIÓN DE COLA OFFLINE
  const forceSync = async () => {
    await GpsTrackingService.syncPendingQueue();
    const stats = await OfflineQueueService.getStats();
    setPendingSyncCount(stats.pendingCount);
  };

  // =========================================================================
  // RENDER: PANTALLA DE LOGIN POR TELÉFONO
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="driver-container" style={{ paddingTop: '3rem' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: '0.5rem', fontSize: '1.75rem' }}>
            Transportes La Solución
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
            Portal Exclusivo de Conductores
          </p>

          <form onSubmit={handleLogin}>
            <div style={{ textAlign: 'left', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Número Telefónico</label>
            </div>
            <input
              type="tel"
              className="input-control"
              placeholder="Ej: 8888-8888"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              required
            />

            <div style={{ textAlign: 'left', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Contraseña</label>
            </div>
            <input
              type="password"
              className="input-control"
              placeholder="Su contraseña asignada"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
            />

            {loginError && (
              <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {loginError}
              </div>
            )}

            <button type="submit" className="btn btn-primary">
              Iniciar Turno / Conectar
            </button>
          </form>

          <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            ¿Olvidó su contraseña? Solicite el restablecimiento al administrador de despacho.
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER: CAMBIO OBLIGATORIO DE CONTRASEÑA
  // =========================================================================
  if (currentUser.mustChangePassword) {
    return (
      <div className="driver-container" style={{ paddingTop: '3rem' }}>
        <div className="card">
          <h2 style={{ color: 'var(--primary)', marginBottom: '0.75rem' }}>Cambio de Contraseña Requerido</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
            Por seguridad de la plataforma, debe definir una nueva contraseña personal antes de continuar.
          </p>
          <form onSubmit={handlePasswordChange}>
            <input
              type="password"
              className="input-control"
              placeholder="Nueva contraseña segura (mín 8 car)"
              value={newPasswordInput}
              onChange={(e) => setNewPasswordInput(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary">
              Guardar y Continuar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER: PANTALLA PRINCIPAL OPERATIVA
  // =========================================================================
  return (
    <div className="driver-container">
      {/* Cabecera del Conductor */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem' }}>{currentUser.fullName || 'Conductor'}</h2>
          <span className={`status-badge ${isShiftActive ? 'online' : 'offline'}`}>
            {isShiftActive ? '● Turno Activo (GPS ON)' : '○ Fuera de Turno'}
          </span>
        </div>
        <button
          onClick={() => {
            GpsTrackingService.stopTracking();
            setCurrentUser(null);
          }}
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
        >
          Cerrar
        </button>
      </div>

      {/* Control del Turno */}
      <div className="card">
        <button
          onClick={toggleShift}
          className={`btn ${isShiftActive ? 'btn-danger' : 'btn-success'}`}
        >
          {isShiftActive ? '⏹ Finalizar Turno' : '▶ Iniciar Turno de Trabajo'}
        </button>
      </div>

      {/* Estado del GPS y Sincronización Offline */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
          <span><strong>Monitoreo GPS:</strong> {isShiftActive ? 'Frecuencia ~5 min' : 'Detenido'}</span>
          <span><strong>Cola Offline:</strong> {pendingSyncCount} pendientes</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{lastSyncText}</span>
          <button
            onClick={forceSync}
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
          >
            Sincronizar Ahora
          </button>
        </div>
      </div>

      {/* Viaje Asignado Actual */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>Viaje Asignado</h3>
          <span className="status-badge online">{activeTrip.status.toUpperCase()}</span>
        </div>

        <p style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '0.25rem' }}>
          {activeTrip.customerName}
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          📍 {activeTrip.destination}
        </p>
        <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.75rem' }}>
          👥 Pasajeros: {activeTrip.adults} Adultos • Equipaje: {activeTrip.luggage ? 'Sí' : 'No'}
        </p>

        {/* Acciones de Navegación Externa */}
        <div className="nav-actions-grid">
          <button
            onClick={() => ExternalNavigationService.openWaze(activeTrip.pickupCoords.lat, activeTrip.pickupCoords.lng)}
            className="btn btn-secondary"
            style={{ fontSize: '0.95rem' }}
          >
            🧭 Waze
          </button>
          <button
            onClick={() => ExternalNavigationService.openGoogleMaps(activeTrip.pickupCoords.lat, activeTrip.pickupCoords.lng)}
            className="btn btn-secondary"
            style={{ fontSize: '0.95rem' }}
          >
            🗺️ Google Maps
          </button>
          <button
            onClick={() => ExternalNavigationService.callPhone(activeTrip.customerPhone)}
            className="btn btn-secondary"
            style={{ fontSize: '0.95rem' }}
          >
            📞 Llamar
          </button>
          <button
            onClick={() => ExternalNavigationService.openWhatsApp(activeTrip.customerPhone, 'Hola, voy de camino para su traslado.')}
            className="btn btn-secondary"
            style={{ fontSize: '0.95rem' }}
          >
            💬 WhatsApp
          </button>
        </div>

        {/* Transiciones del Viaje */}
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          {activeTrip.status === 'assigned' && (
            <button
              onClick={() => setActiveTrip((t) => ({ ...t, status: 'arrived' }))}
              className="btn btn-primary"
            >
              Marcar Llegada al Punto
            </button>
          )}
          {activeTrip.status === 'arrived' && (
            <button
              onClick={() => setActiveTrip((t) => ({ ...t, status: 'in_progress' }))}
              className="btn btn-success"
            >
              Iniciar Traslado
            </button>
          )}
          {activeTrip.status === 'in_progress' && (
            <button
              onClick={() => {
                setActiveTrip((t) => ({ ...t, status: 'completed' }));
                alert('Viaje completado exitosamente.');
              }}
              className="btn btn-success"
            >
              Finalizar Viaje
            </button>
          )}
        </div>
      </div>

      {/* Botón de Asistencia / Avería en Carretera */}
      <div className="card">
        <button
          onClick={() => setShowIncidentModal(true)}
          className="btn btn-danger"
          style={{ fontSize: '0.95rem' }}
        >
          🚨 Reportar Avería / Auxilio en Ruta
        </button>
      </div>

      {/* Modal de Reporte de Incidente */}
      {showIncidentModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 9999
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
            <h3 style={{ color: 'var(--danger)', marginBottom: '0.75rem' }}>Reporte de Auxilio</h3>
            <textarea
              className="input-control"
              placeholder="Describa el percance mecánico o incidente..."
              rows={3}
              value={incidentDescription}
              onChange={(e) => setIncidentDescription(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  alert('Auxilio reportado a la central de despacho.');
                  setShowIncidentModal(false);
                }}
                className="btn btn-danger"
              >
                Enviar Auxilio
              </button>
              <button
                onClick={() => setShowIncidentModal(false)}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
