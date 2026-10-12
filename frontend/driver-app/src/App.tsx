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

  // Comprobar si es el teléfono quemado de testing
  const cleanPhone = phoneInput.replace(/\D/g, '');
  const isTestingDriver = cleanPhone === '88888888' || cleanPhone === '50688888888';

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

  // Restaurar sesión de conductor persistente
  useEffect(() => {
    const saved = localStorage.getItem('tls_driver_session');
    if (saved) {
      try {
        setCurrentUser(JSON.parse(saved));
      } catch (_e) {}
    }
  }, []);

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

  // 1. INICIO DE SESIÓN POR TELÉFONO (CON CONDUCTOR QUEMADO 88888888 SIN CONTRASEÑA)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const phoneOnly = phoneInput.replace(/\D/g, '');

    // Acceso especial de testing: 88888888 entra directo sin contraseña
    if (phoneOnly === '88888888' || phoneOnly === '50688888888') {
      const testingDriver: AuthSessionUser = {
        id: 'driver-testing-88888888',
        email: 'chofer88888888@transporteslasolucion.cr',
        fullName: 'Conductor Testing (8888-8888)',
        roles: ['driver'],
        driverId: 'driver-testing-88888888',
        mustChangePassword: false,
      };
      setCurrentUser(testingDriver);
      localStorage.setItem('tls_driver_session', JSON.stringify(testingDriver));
      return;
    }

    if (!passwordInput.trim()) {
      setLoginError('Por favor ingrese su contraseña asignada.');
      return;
    }

    try {
      const res = await apiClient.signInWithPhone(phoneInput, passwordInput);
      setCurrentUser(res.user);
      localStorage.setItem('tls_driver_session', JSON.stringify(res.user));
    } catch (err: any) {
      setLoginError(err.message || 'Error al iniciar sesión');
    }
  };

  const handleLogout = () => {
    GpsTrackingService.stopTracking();
    setIsShiftActive(false);
    localStorage.removeItem('tls_driver_session');
    setCurrentUser(null);
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
      <div className="driver-container" style={{ paddingTop: '2.5rem' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 440, margin: '0 auto' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🚖</div>
          <h1 style={{ color: 'var(--primary)', marginBottom: '0.25rem', fontSize: '1.6rem', fontWeight: 800 }}>
            Transportes La Solución
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Portal Oficial de Conductores
          </p>

          <form onSubmit={handleLogin}>
            <div style={{ textAlign: 'left', marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Número Telefónico:</label>
            </div>
            <input
              type="tel"
              className="input-control"
              placeholder="Ej: 8888-8888"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              required
              autoFocus
              style={{ width: '100%', marginBottom: '1rem', padding: '12px', fontSize: '1rem', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: 8 }}
            />

            {!isTestingDriver ? (
              <>
                <div style={{ textAlign: 'left', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Contraseña:</label>
                </div>
                <input
                  type="password"
                  className="input-control"
                  placeholder="Contraseña asignada"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  style={{ width: '100%', marginBottom: '1rem', padding: '12px', fontSize: '1rem', background: '#0f172a', border: '1px solid #334155', color: '#fff', borderRadius: 8 }}
                />
              </>
            ) : (
              <div style={{ background: '#1e3a8a', border: '1px solid #3b82f6', color: '#bfdbfe', padding: '10px 12px', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.85rem', textAlign: 'left' }}>
                ✓ <strong>Conductor Testing (8888-8888):</strong> Acceso directo habilitado sin contraseña.
              </div>
            )}

            {loginError && (
              <div style={{ color: '#f87171', background: '#7f1d1d', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'left' }}>
                {loginError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontWeight: 700, fontSize: '1rem', borderRadius: 8 }}>
              {isTestingDriver ? 'Ingresar Directamente (Testing)' : 'Iniciar Turno / Conectar'}
            </button>
          </form>

          <div style={{ marginTop: '1.75rem', padding: '10px', background: '#0f172a', borderRadius: 8, fontSize: '0.78rem', color: '#94a3b8', border: '1px dashed #334155', textAlign: 'left' }}>
            <strong style={{ color: '#38bdf8', display: 'block', marginBottom: 2 }}>Cuenta de Demostración y Pruebas:</strong>
            Teléfono: <code>88888888</code> (Sin contraseña)
          </div>
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
            Por motivos de seguridad, debe definir su contraseña personal antes de iniciar ruta.
          </p>

          <form onSubmit={handlePasswordChange}>
            <input
              type="password"
              className="input-control"
              placeholder="Nueva contraseña (mínimo 8 caracteres)"
              value={newPasswordInput}
              onChange={(e) => setNewPasswordInput(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>
              Confirmar y Activar Cuenta
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
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{currentUser.fullName || 'Conductor'}</h2>
          <span className={`status-badge ${isShiftActive ? 'online' : 'offline'}`} style={{ marginTop: 4, display: 'inline-block' }}>
            {isShiftActive ? '● Turno Activo (GPS ON)' : '○ Fuera de Turno'}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0.5rem 0.85rem', fontSize: '0.85rem', background: '#dc2626', color: '#fff', border: 'none' }}
        >
          Cerrar Sesión
        </button>
      </div>

      {/* Control del Turno */}
      <div className="card">
        <button
          onClick={toggleShift}
          className={`btn ${isShiftActive ? 'btn-danger' : 'btn-success'}`}
          style={{ width: '100%', padding: '14px', fontSize: '1.05rem', fontWeight: 800, borderRadius: 8 }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <span>{lastSyncText}</span>
          <button
            onClick={forceSync}
            className="btn btn-secondary"
            style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
          >
            Sincronizar Lote
          </button>
        </div>
      </div>

      {/* Tarjeta de Viaje Asignado */}
      {activeTrip && (
        <div className="card trip-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span className="badge">Viaje Activo</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ID: {activeTrip.id}</span>
          </div>

          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>{activeTrip.customerName}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            📍 {activeTrip.destination}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <div><strong>Pasajeros:</strong> {activeTrip.adults}</div>
            <div><strong>Equipaje:</strong> {activeTrip.luggage ? 'Sí' : 'No'}</div>
          </div>

          {/* Botones de Navegación Externa */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              onClick={() => ExternalNavigationService.openWaze(activeTrip.pickupCoords.lat, activeTrip.pickupCoords.lng)}
              className="btn btn-secondary"
              style={{ background: '#33ccff', color: '#000', fontWeight: 'bold' }}
            >
              Navegar con Waze
            </button>
            <button
              onClick={() => ExternalNavigationService.openGoogleMaps(activeTrip.pickupCoords.lat, activeTrip.pickupCoords.lng)}
              className="btn btn-secondary"
              style={{ background: '#34a853', color: '#fff', fontWeight: 'bold' }}
            >
              Google Maps
            </button>
          </div>

          {/* Confirmar Recogida / Estados */}
          {activeTrip.status === 'assigned' && (
            <button
              onClick={() => setActiveTrip((prev) => ({ ...prev, status: 'arrived' }))}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              Llegué al Punto de Recogida
            </button>
          )}

          {activeTrip.status === 'arrived' && (
            <button
              onClick={() => setActiveTrip((prev) => ({ ...prev, status: 'in_progress' }))}
              className="btn btn-success"
              style={{ width: '100%' }}
            >
              Iniciar Recorrido con Pasajero
            </button>
          )}

          {activeTrip.status === 'in_progress' && (
            <button
              onClick={() => {
                alert('Viaje completado exitosamente.');
                setActiveTrip((prev) => ({ ...prev, status: 'completed' }));
              }}
              className="btn btn-primary"
              style={{ width: '100%', background: '#6366f1' }}
            >
              Finalizar Viaje en Destino
            </button>
          )}
        </div>
      )}

      {/* Botón de Emergencia / Incidencia */}
      <div style={{ marginTop: '1rem', marginBottom: '2rem' }}>
        <button
          onClick={() => setShowIncidentModal(true)}
          className="btn btn-danger"
          style={{ width: '100%' }}
        >
          Reportar Avería o Percance en Ruta
        </button>
      </div>

      {/* Modal de Reporte de Incidencias */}
      {showIncidentModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 1000,
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>Reporte Operativo</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Describa el incidente ocurrido para notificar al supervisor de flota inmediatamente.
            </p>
            <textarea
              className="input-control"
              rows={4}
              placeholder="Ej: Falla mecánica en llanta delantera, retraso por tráfico..."
              value={incidentDescription}
              onChange={(e) => setIncidentDescription(e.target.value)}
              style={{ resize: 'none', marginBottom: '1rem', width: '100%', padding: '10px', background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: 8 }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setShowIncidentModal(false)}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  alert('Reporte enviado a la central.');
                  setIncidentDescription('');
                  setShowIncidentModal(false);
                }}
                className="btn btn-danger"
              >
                Enviar Reporte
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
