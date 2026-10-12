import React, { useState, useEffect } from 'react';
import { TransportesApiClient } from '@transportes-la-solucion/api-client';

type Tab = 'operaciones' | 'solicitudes' | 'viajes' | 'conductores' | 'metricas';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy';

const apiClient = new TransportesApiClient({
  supabaseUrl,
  supabaseAnonKey,
});

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  // Campos de Login Admin
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState<Tab>('operaciones');

  // Datos reales desde Supabase
  const [requests, setRequests] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Formulario creación de conductor
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverIdNum, setNewDriverIdNum] = useState('');
  const [newDriverLicense, setNewDriverLicense] = useState('');
  const [newDriverTempPass, setNewDriverTempPass] = useState('');
  const [driverSubmitStatus, setDriverSubmitStatus] = useState('');

  // 1. Verificación inicial de sesión y rol admin
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    setLoadingAuth(true);
    try {
      const client = apiClient.getRawClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        setSession(null);
        setIsAdmin(false);
      } else {
        // Verificar rol admin en user_roles
        const { data: roles } = await client
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (roles) {
          setSession(user);
          setIsAdmin(true);
          loadDashboardData();
        } else {
          setSession(null);
          setIsAdmin(false);
          setLoginError('Acceso denegado: este usuario no posee rol de Administrador.');
        }
      }
    } catch (_e) {
      setSession(null);
      setIsAdmin(false);
    } finally {
      setLoadingAuth(false);
    }
  }

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      await apiClient.signInWithEmail(loginEmail, loginPassword);
      await checkAuth();
    } catch (err: any) {
      setLoginError(err.message || 'Error de autenticación');
    }
  }

  async function handleLogout() {
    await apiClient.signOut();
    setSession(null);
    setIsAdmin(false);
  }

  // 2. Carga de datos operativos reales
  async function loadDashboardData() {
    setLoadingData(true);
    try {
      const client = apiClient.getRawClient();

      const [reqRes, drivRes, vehRes, tripRes, locRes] = await Promise.all([
        client.from('transport_requests').select('*').order('created_at', { ascending: false }).limit(50),
        client.from('drivers').select('*').order('full_name'),
        client.from('vehicles').select('*').order('license_plate'),
        client.from('trips').select('*').order('created_at', { ascending: false }).limit(50),
        client.from('driver_current_location').select('*, drivers(full_name)'),
      ]);

      if (reqRes.data) setRequests(reqRes.data);
      if (drivRes.data) setDrivers(drivRes.data);
      if (vehRes.data) setVehicles(vehRes.data);
      if (tripRes.data) setTrips(tripRes.data);
      if (locRes.data) setLocations(locRes.data);
    } catch (e) {
      console.error('Error cargando datos del dashboard:', e);
    } finally {
      setLoadingData(false);
    }
  }

  // 3. Crear conductor mediante Edge Function manage-driver
  async function handleCreateDriver(e: React.FormEvent) {
    e.preventDefault();
    setDriverSubmitStatus('Creando conductor de forma segura...');
    try {
      const client = apiClient.getRawClient();
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(`${supabaseUrl}/functions/v1/manage-driver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'create',
          fullName: newDriverName,
          phoneNumber: newDriverPhone,
          identificationNumber: newDriverIdNum,
          licenseNumber: newDriverLicense,
          licenseExpiresAt: '2028-12-31',
          temporaryPassword: newDriverTempPass,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Fallo al crear conductor');
      }

      setDriverSubmitStatus('✓ Conductor creado exitosamente con credenciales temporales.');
      setNewDriverName('');
      setNewDriverPhone('');
      setNewDriverIdNum('');
      setNewDriverLicense('');
      setNewDriverTempPass('');
      loadDashboardData();
    } catch (err: any) {
      setDriverSubmitStatus(`Error: ${err.message}`);
    }
  }

  // 4. Convertir solicitud a viaje real
  async function convertToTrip(reqItem: any) {
    const client = apiClient.getRawClient();
    try {
      const firstDriver = drivers.find((d) => d.active);
      const firstVehicle = vehicles.find((v) => v.active);

      const { data: tripData, error: tripErr } = await client
        .from('trips')
        .insert({
          request_id: reqItem.id,
          driver_id: firstDriver?.id || null,
          vehicle_id: firstVehicle?.id || null,
          status: 'assigned',
          origin_address: reqItem.origin_address,
          destination_address: reqItem.destination_address,
          scheduled_departure_at: reqItem.trip_date ? `${reqItem.trip_date}T08:00:00Z` : new Date().toISOString(),
          customer_name: reqItem.customer_name,
          customer_phone: reqItem.customer_phone,
          passengers_count: reqItem.adults_count + reqItem.minors_count,
        })
        .select()
        .single();

      if (tripErr) throw tripErr;

      // Actualizar estado de la solicitud
      await client
        .from('transport_requests')
        .update({ status: 'converted_to_trip' })
        .eq('id', reqItem.id);

      alert(`Viaje despachado correctamente (ID: ${tripData.id})`);
      loadDashboardData();
    } catch (err: any) {
      alert(`Error al convertir viaje: ${err.message}`);
    }
  }

  if (loadingAuth) {
    return <div className="p-8 text-center">Verificando autorización administrativa...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="login-screen" style={{ maxWidth: 400, margin: '80px auto', padding: 24, border: '1px solid #334155', borderRadius: 8, background: '#0f172a', color: '#fff' }}>
        <h2 style={{ marginBottom: 16 }}>Acceso Administrativo TLS</h2>
        {loginError && <div style={{ color: '#f87171', marginBottom: 12, fontSize: '0.9rem' }}>{loginError}</div>}
        <form onSubmit={handleAdminLogin}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Correo Electrónico:</label>
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
              style={{ width: '100%', padding: 8, background: '#1e293b', border: '1px solid #475569', color: '#fff', borderRadius: 4 }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Contraseña:</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              style={{ width: '100%', padding: 8, background: '#1e293b', border: '1px solid #475569', color: '#fff', borderRadius: 4 }}
            />
          </div>
          <button type="submit" style={{ width: '100%', padding: '10px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold', cursor: 'pointer' }}>
            Ingresar al Dashboard
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Barra Lateral de Navegación */}
      <aside className="sidebar">
        <h2 className="sidebar-title">La Solución VIP</h2>
        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 16 }}>
          Admin: {session?.email}
        </div>
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
          🚐 Despacho de Viajes ({trips.length})
        </button>
        <button
          onClick={() => setActiveTab('conductores')}
          className={`nav-item ${activeTab === 'conductores' ? 'active' : ''}`}
        >
          👥 Gestión de Conductores ({drivers.length})
        </button>
        <button
          onClick={() => setActiveTab('metricas')}
          className={`nav-item ${activeTab === 'metricas' ? 'active' : ''}`}
        >
          📊 Métricas y Cierre
        </button>
        <button onClick={handleLogout} className="nav-item" style={{ marginTop: 'auto', color: '#f87171' }}>
          Cerrar Sesión
        </button>
      </aside>

      {/* Contenido Principal */}
      <main className="main-content">
        <header className="header-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1>Panel de Control Operativo - Transportes La Solución</h1>
          <button onClick={loadDashboardData} style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            {loadingData ? 'Actualizando...' : '🔄 Actualizar'}
          </button>
        </header>

        {activeTab === 'operaciones' && (
          <section className="section-block">
            <h2>Ubicación en Tiempo Real de la Flota ({locations.length} Unidades)</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Conductor</th>
                    <th>Latitud</th>
                    <th>Longitud</th>
                    <th>Velocidad (km/h)</th>
                    <th>Batería</th>
                    <th>Última Transmisión</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>Sin telemetría activa reportada en este momento.</td></tr>
                  ) : (
                    locations.map((loc) => (
                      <tr key={loc.driver_id}>
                        <td><strong>{loc.drivers?.full_name || loc.driver_id}</strong></td>
                        <td>{Number(loc.latitude).toFixed(5)}</td>
                        <td>{Number(loc.longitude).toFixed(5)}</td>
                        <td>{(Number(loc.speed_mps || 0) * 3.6).toFixed(1)} km/h</td>
                        <td>{loc.battery_level ? `${loc.battery_level}%` : 'N/A'}</td>
                        <td>{new Date(loc.captured_at).toLocaleTimeString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'solicitudes' && (
          <section className="section-block">
            <h2>Solicitudes Web de Pasajeros</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>N° Solicitud</th>
                    <th>Cliente</th>
                    <th>Teléfono</th>
                    <th>Fecha Viaje</th>
                    <th>Destino</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td><span className="badge-req">{r.request_number}</span></td>
                      <td>{r.customer_name}</td>
                      <td>{r.customer_phone}</td>
                      <td>{r.trip_date}</td>
                      <td>{r.destination_address}</td>
                      <td><span className={`status-tag status-${r.status}`}>{r.status}</span></td>
                      <td>
                        <button
                          onClick={() => window.open(`https://wa.me/${r.customer_phone}`, '_blank')}
                          className="btn-action btn-wa"
                        >
                          WhatsApp
                        </button>
                        {r.status !== 'converted_to_trip' && (
                          <button
                            onClick={() => convertToTrip(r)}
                            className="btn-action btn-trip"
                          >
                            Asignar Viaje
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'viajes' && (
          <section className="section-block">
            <h2>Viajes Despachados ({trips.length})</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID Viaje</th>
                    <th>Cliente</th>
                    <th>Origen</th>
                    <th>Destino</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8' }}>No hay viajes despachados registrados.</td></tr>
                  ) : (
                    trips.map((t) => (
                      <tr key={t.id}>
                        <td>{t.id.slice(0, 8)}...</td>
                        <td>{t.customer_name}</td>
                        <td>{t.origin_address}</td>
                        <td>{t.destination_address}</td>
                        <td><span className="badge-req">{t.status}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'conductores' && (
          <section className="section-block">
            <h2>Gestión de Conductores</h2>
            <div style={{ marginBottom: 24, padding: 16, background: '#1e293b', borderRadius: 8 }}>
              <h3>Registrar Nuevo Conductor (Vía Edge Function)</h3>
              {driverSubmitStatus && <div style={{ margin: '8px 0', color: '#60a5fa' }}>{driverSubmitStatus}</div>}
              <form onSubmit={handleCreateDriver} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <input placeholder="Nombre Completo" value={newDriverName} onChange={(e) => setNewDriverName(e.target.value)} required style={{ padding: 8, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4 }} />
                <input placeholder="Teléfono (ej: 8888-8888)" value={newDriverPhone} onChange={(e) => setNewDriverPhone(e.target.value)} required style={{ padding: 8, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4 }} />
                <input placeholder="Cédula / Identificación" value={newDriverIdNum} onChange={(e) => setNewDriverIdNum(e.target.value)} required style={{ padding: 8, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4 }} />
                <input placeholder="N° Licencia de Conducir" value={newDriverLicense} onChange={(e) => setNewDriverLicense(e.target.value)} required style={{ padding: 8, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4 }} />
                <input placeholder="Contraseña Temporal" type="password" value={newDriverTempPass} onChange={(e) => setNewDriverTempPass(e.target.value)} required style={{ padding: 8, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 4 }} />
                <button type="submit" style={{ padding: 8, background: '#10b981', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold', cursor: 'pointer' }}>Guardar Conductor</button>
              </form>
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Cédula</th>
                    <th>Licencia</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id}>
                      <td><strong>{d.full_name}</strong></td>
                      <td>{d.phone_number}</td>
                      <td>{d.identification_number}</td>
                      <td>{d.license_number}</td>
                      <td>
                        <span className={`status-tag ${d.active ? 'status-active' : 'status-inactive'}`}>
                          {d.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'metricas' && (
          <section className="section-block">
            <h2>Métricas Consolidadas y Cierre Mensual</h2>
            <p>Las métricas se calculan automáticamente sobre telemetría con calidad validada (excluyendo rebotes GPS o errores de velocidad).</p>
            <div style={{ padding: 16, background: '#1e293b', borderRadius: 8, marginTop: 16 }}>
              <h3>Purga de Telemetría Cruda (Mes Cerrado)</h3>
              <p style={{ fontSize: '0.88rem', color: '#94a3b8' }}>
                La retención se basa en la consolidación y purga mensual del mes calendario cerrado. Las tablas maestras, solicitudes, viajes y métricas consolidadas se conservan permanentemente.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
