import React, { useState } from 'react';

type Tab = 'operaciones' | 'solicitudes' | 'viajes' | 'conductores' | 'metricas';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('operaciones');

  // Estado de Solicitudes (Sincronizado con transport_requests)
  const [requests, setRequests] = useState([
    {
      id: 'req-01',
      requestNumber: 'TLS-20261012-0001',
      customerName: 'Karla Morales',
      customerPhone: '50688882233',
      tripDate: '2026-10-15',
      origin: 'San Pedro de Poás, Alajuela',
      destination: 'Aeropuerto Juan Santamaría (SJO)',
      passengers: '2 Adultos, 1 Maleta',
      status: 'new', // 'new' | 'whatsapp_opened' | 'converted_to_trip'
    },
    {
      id: 'req-02',
      requestNumber: 'TLS-20261012-0002',
      customerName: 'Esteban Méndez',
      customerPhone: '50687224411',
      tripDate: '2026-10-16',
      origin: 'Carrillos de Poás',
      destination: 'Frontera Peñas Blancas, Nicaragua',
      passengers: '4 Adultos, 4 Maletas',
      status: 'whatsapp_opened',
    },
  ]);

  // Estado de Conductores
  const [drivers, setDrivers] = useState([
    {
      id: 'd-01',
      name: 'Álvaro Scott',
      phone: '50672094457',
      assignedVehicle: 'TLS-101 (HiAce VIP)',
      active: true,
      lastSync: 'Hace 4 minutos',
      coords: '10.0754, -84.2441 (Poás)',
    },
    {
      id: 'd-02',
      name: 'Carlos Solís',
      phone: '50688991122',
      assignedVehicle: 'TLS-102 (Staria Luxury)',
      active: true,
      lastSync: 'Hace 2 minutos',
      coords: '10.0162, -84.2141 (Alajuela)',
    },
  ]);

  // Acciones sobre Solicitudes
  const openCustomerWhatsApp = (phone: string, requestNumber: string) => {
    const text = encodeURIComponent(`Hola, le contactamos de Transportes La Solución respecto a su solicitud ${requestNumber}.`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const convertToTrip = (id: string) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'converted_to_trip' } : r))
    );
    alert('Solicitud convertida en Viaje Despachado exitosamente.');
  };

  const toggleDriverActive = (id: string) => {
    setDrivers((prev) =>
      prev.map((d) => (d.id === id ? { ...d, active: !d.active } : d))
    );
  };

  return (
    <div className="dashboard-layout">
      {/* Barra Lateral de Navegación */}
      <aside className="sidebar">
        <h2 className="sidebar-title">La Solución VIP</h2>
        <button
          onClick={() => setActiveTab('operaciones')}
          className={`nav-item ${activeTab === 'operaciones' ? 'active' : ''}`}
        >
          📍 Operación en Vivo
        </button>
        <button
          onClick={() => setActiveTab('solicitudes')}
          className={`nav-item ${activeTab === 'solicitudes' ? 'active' : ''}`}
        >
          📨 Solicitudes Web ({requests.filter((r) => r.status === 'new').length})
        </button>
        <button
          onClick={() => setActiveTab('viajes')}
          className={`nav-item ${activeTab === 'viajes' ? 'active' : ''}`}
        >
          🚐 Despacho de Viajes
        </button>
        <button
          onClick={() => setActiveTab('conductores')}
          className={`nav-item ${activeTab === 'conductores' ? 'active' : ''}`}
        >
          👤 Flota y Choferes
        </button>
        <button
          onClick={() => setActiveTab('metricas')}
          className={`nav-item ${activeTab === 'metricas' ? 'active' : ''}`}
        >
          📊 Métricas y Purga
        </button>
      </aside>

      {/* Contenido Principal */}
      <main className="main-content">
        {/* TAB 1: OPERACIÓN EN VIVO */}
        {activeTab === 'operaciones' && (
          <div>
            <h1 style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-heading)' }}>
              Monitoreo y Telemetría en Vivo
            </h1>
            <div className="panel">
              <h3 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>
                Conductores Conectados en Tiempo Real
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Conductor</th>
                    <th>Unidad Asignada</th>
                    <th>Estado</th>
                    <th>Última Posición GPS</th>
                    <th>Última Sincronización</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id}>
                      <td><strong>{d.name}</strong><br /><small style={{ color: 'var(--text-muted)' }}>{d.phone}</small></td>
                      <td>{d.assignedVehicle}</td>
                      <td>
                        <span className={`badge ${d.active ? 'badge-wa' : 'badge-new'}`}>
                          {d.active ? 'EN TURNO' : 'INACTIVO'}
                        </span>
                      </td>
                      <td>{d.coords}</td>
                      <td>{d.lastSync}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: SOLICITUDES PÚBLICAS */}
        {activeTab === 'solicitudes' && (
          <div>
            <h1 style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-heading)' }}>
              Bandeja de Solicitudes Públicas
            </h1>
            <div className="panel">
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Solicitudes registradas formalmente en PostgreSQL antes de WhatsApp.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>N° Solicitud</th>
                    <th>Cliente</th>
                    <th>Fecha</th>
                    <th>Ruta (Origen ➔ Destino)</th>
                    <th>Detalles</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.requestNumber}</strong></td>
                      <td>{r.customerName}<br /><small style={{ color: 'var(--text-muted)' }}>{r.customerPhone}</small></td>
                      <td>{r.tripDate}</td>
                      <td>{r.origin} ➔ {r.destination}</td>
                      <td>{r.passengers}</td>
                      <td>
                        <span className={`badge ${r.status === 'new' ? 'badge-new' : r.status === 'whatsapp_opened' ? 'badge-wa' : 'badge-done'}`}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            onClick={() => openCustomerWhatsApp(r.customerPhone, r.requestNumber)}
                            className="btn-dash btn-outline"
                          >
                            💬 WhatsApp
                          </button>
                          {r.status !== 'converted_to_trip' && (
                            <button
                              onClick={() => convertToTrip(r.id)}
                              className="btn-dash btn-primary"
                            >
                              Aceptar Viaje
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: DESPACHO DE VIAJES */}
        {activeTab === 'viajes' && (
          <div>
            <h1 style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-heading)' }}>
              Despacho de Viajes Asignados
            </h1>
            <div className="panel">
              <p style={{ color: 'var(--text-muted)' }}>
                Gestión de viajes confirmados, asignación de choferes y seguimiento de paradas ordenadas.
              </p>
            </div>
          </div>
        )}

        {/* TAB 4: FLOTA Y CONDUCTORES */}
        {activeTab === 'conductores' && (
          <div>
            <h1 style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-heading)' }}>
              Gestión de Conductores y Dispositivos
            </h1>
            <div className="panel">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono de Acceso</th>
                    <th>Unidad Asignada</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td>{d.phone}</td>
                      <td>{d.assignedVehicle}</td>
                      <td>{d.active ? 'Activo' : 'Desactivado'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            onClick={() => alert(`Contraseña temporal restablecida para ${d.name}`)}
                            className="btn-dash btn-outline"
                          >
                            Reset Password
                          </button>
                          <button
                            onClick={() => toggleDriverActive(d.id)}
                            className={`btn-dash ${d.active ? 'btn-danger' : 'btn-success'}`}
                          >
                            {d.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: MÉTRICAS Y PURGADO */}
        {activeTab === 'metricas' && (
          <div>
            <h1 style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-heading)' }}>
              Métricas Consolidadas y Mantenimiento
            </h1>
            <div className="panel">
              <h3 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Resumen Mensual</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                Kilómetros recorridos: 1,840 km • Horas en servicio: 142h • Tasa de puntualidad: 99.2%
              </p>
              <button
                onClick={() => alert('Función de purga programada en Supabase Cron (se ejecuta mensualmente de forma segura tras verificar consistencia).')}
                className="btn-dash btn-outline"
              >
                Auditar Estado de Purga Mensual
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
