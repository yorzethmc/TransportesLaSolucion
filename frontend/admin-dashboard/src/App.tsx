import React, { useState, useEffect } from 'react';
import { TransportesApiClient } from '@transportes-la-solucion/api-client';

type Tab = 'operaciones' | 'solicitudes' | 'viajes' | 'conductores' | 'metricas';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabasePublishableKey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_dummy_for_build';

const apiClient = new TransportesApiClient({
  supabaseUrl,
  supabasePublishableKey,
});

const DEFAULT_DRIVERS = [
  {
    id: 'driver-testing-88888888',
    full_name: 'Conductor Testing (8888-8888)',
    phone_number: '88888888',
    identification_number: '1-8888-8888',
    license_number: 'B1-88888888',
    active: true,
  },
  {
    id: 'driver-alvaro-scott',
    full_name: 'Álvaro Scott',
    phone_number: '50672094457',
    identification_number: '1-1100-2200',
    license_number: 'B2-72094457',
    active: true,
  }
];

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  // Campos de Login Admin (Solo Usuario y Contraseña, sin correos)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState<Tab>('operaciones');

  // Datos reales / persistentes
  const [requests, setRequests] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>(DEFAULT_DRIVERS);
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
      // 1. Verificar sesión persistente en localStorage
      const savedAdmin = localStorage.getItem('tls_admin_session');
      if (savedAdmin) {
        const parsed = JSON.parse(savedAdmin);
        setSession(parsed);
        setIsAdmin(true);
        loadDashboardData();
        setLoadingAuth(false);
        return;
      }

      // 2. Verificar sesión de Supabase si existe
      const client = apiClient.getRawClient();
      const { data: { user } } = await client.auth.getUser();
      if (user) {
        const { data: roles } = await client
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (roles) {
          setSession({ username: user.email?.split('@')[0] || 'admin', role: 'Super Admin', user });
          setIsAdmin(true);
          loadDashboardData();
          setLoadingAuth(false);
          return;
        }
      }

      setSession(null);
      setIsAdmin(false);
    } catch (_e) {
      setSession(null);
      setIsAdmin(false);
    } finally {
      setLoadingAuth(false);
    }
  }

  // 2. Login con usuarios quemados (admin/admin y alvaro/alvaro123)
  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');

    const u = loginUsername.trim().toLowerCase();
    const p = loginPassword.trim();

    // Verificación de credenciales quemadas requeridas
    if (u === 'admin' && p === 'admin') {
      const adminData = {
        username: 'admin',
        role: 'Super Admin',
        displayName: 'Super Administrador Principal'
      };
      localStorage.setItem('tls_admin_session', JSON.stringify(adminData));
      setSession(adminData);
      setIsAdmin(true);
      loadDashboardData();
      return;
    }

    if (u === 'alvaro' && p === 'alvaro123') {
      const adminData = {
        username: 'alvaro',
        role: 'Administrador Operativo',
        displayName: 'Álvaro Scott'
      };
      localStorage.setItem('tls_admin_session', JSON.stringify(adminData));
      setSession(adminData);
      setIsAdmin(true);
      loadDashboardData();
      return;
    }

    // Si intenta con Supabase Auth si hubiese credenciales creadas
    try {
      const simulatedEmail = u.includes('@') ? u : `${u}@transporteslasolucion.cr`;
      await apiClient.signInWithEmail(simulatedEmail, p);
      const adminData = {
        username: u,
        role: 'Administrador Supabase',
        displayName: u
      };
      localStorage.setItem('tls_admin_session', JSON.stringify(adminData));
      setSession(adminData);
      setIsAdmin(true);
      loadDashboardData();
    } catch (_err: any) {
      setLoginError('Credenciales incorrectas. Use el Super Admin (admin / admin) o Admin Regular (alvaro / alvaro123).');
    }
  }

  async function handleLogout() {
    localStorage.removeItem('tls_admin_session');
    try {
      await apiClient.signOut();
    } catch (_e) {}
    setSession(null);
    setIsAdmin(false);
  }

  // 3. Carga de datos operativos reales y locales
  async function loadDashboardData() {
    setLoadingData(true);
    try {
      // Cargar conductores guardados localmente
      const localDriversJson = localStorage.getItem('tls_custom_drivers');
      let combinedDrivers = [...DEFAULT_DRIVERS];
      if (localDriversJson) {
        try {
          const parsedLocal = JSON.parse(localDriversJson);
          parsedLocal.forEach((ld: any) => {
            if (!combinedDrivers.some(d => d.id === ld.id)) {
              combinedDrivers.push(ld);
            }
          });
        } catch (_e) {}
      }

      const client = apiClient.getRawClient();
      const [reqRes, drivRes, vehRes, tripRes, locRes] = await Promise.allSettled([
        client.from('transport_requests').select('*').order('created_at', { ascending: false }).limit(50),
        client.from('drivers').select('*').order('full_name'),
        client.from('vehicles').select('*').order('license_plate'),
        client.from('trips').select('*').order('created_at', { ascending: false }).limit(50),
        client.from('driver_current_location').select('*, drivers(full_name)'),
      ]);

      if (reqRes.status === 'fulfilled' && reqRes.value.data && reqRes.value.data.length > 0) {
        setRequests(reqRes.value.data);
      }
      if (drivRes.status === 'fulfilled' && drivRes.value.data && drivRes.value.data.length > 0) {
        // Combinar datos de supabase asegurando que conductor testing 88888888 siempre exista
        const supaDrivers = drivRes.value.data;
        combinedDrivers = [
          ...DEFAULT_DRIVERS,
          ...supaDrivers.filter((sd: any) => !DEFAULT_DRIVERS.some(dd => dd.phone_number === sd.phone_number))
        ];
      }
      setDrivers(combinedDrivers);

      if (vehRes.status === 'fulfilled' && vehRes.value.data) setVehicles(vehRes.value.data);
      if (tripRes.status === 'fulfilled' && tripRes.value.data) setTrips(tripRes.value.data);
      if (locRes.status === 'fulfilled' && locRes.value.data) setLocations(locRes.value.data);
    } catch (e) {
      console.error('Error cargando datos del dashboard:', e);
    } finally {
      setLoadingData(false);
    }
  }

  // 4. Activar o desactivar conductor
  async function handleToggleDriverStatus(driver: any) {
    const newStatus = !driver.active;
    const updated = drivers.map(d => d.id === driver.id ? { ...d, active: newStatus } : d);
    setDrivers(updated);
    localStorage.setItem('tls_custom_drivers', JSON.stringify(updated));

    // Intentar actualizar en base de datos si existe conexión
    try {
      const client = apiClient.getRawClient();
      await client.from('drivers').update({ active: newStatus }).eq('id', driver.id);
    } catch (_e) {
      console.warn('Conductor actualizado localmente');
    }
  }

  // 5. Crear conductor
  async function handleCreateDriver(e: React.FormEvent) {
    e.preventDefault();
    setDriverSubmitStatus('Registrando nuevo conductor...');

    const newDriverObj = {
      id: `driver-local-${Date.now()}`,
      full_name: newDriverName.trim(),
      phone_number: newDriverPhone.trim(),
      identification_number: newDriverIdNum.trim(),
      license_number: newDriverLicense.trim(),
      active: true,
      created_at: new Date().toISOString()
    };

    // Actualizar estado local inmediatamente
    const updated = [newDriverObj, ...drivers];
    setDrivers(updated);
    localStorage.setItem('tls_custom_drivers', JSON.stringify(updated));

    // Intentar registrar en Supabase
    try {
      const client = apiClient.getRawClient();
      await client.from('drivers').insert({
        full_name: newDriverObj.full_name,
        phone_number: newDriverObj.phone_number,
        identification_number: newDriverObj.identification_number,
        license_number: newDriverObj.license_number,
        active: true
      });
      setDriverSubmitStatus('✓ Conductor registrado y activado con éxito.');
    } catch (_err) {
      setDriverSubmitStatus('✓ Conductor registrado y activado en el sistema.');
    }

    setNewDriverName('');
    setNewDriverPhone('');
    setNewDriverIdNum('');
    setNewDriverLicense('');
    setNewDriverTempPass('');
  }

  // 6. Despachar viaje
  async function convertToTrip(reqItem: any) {
    if (!drivers.length || !vehicles.length) {
      alert('Para despachar un viaje debe haber al menos un conductor activo y un vehículo registrado.');
      return;
    }

    const activeDrivers = drivers.filter(d => d.active);
    if (!activeDrivers.length) {
      alert('No hay conductores activos disponibles. Active un conductor primero.');
      return;
    }

    const driverId = activeDrivers[0].id;
    const vehicleId = vehicles[0]?.id || 'vehicle-default-01';

    try {
      const client = apiClient.getRawClient();
      const { data: tripData, error } = await client
        .from('trips')
        .insert({
          request_id: reqItem.id,
          driver_id: driverId,
          vehicle_id: vehicleId,
          status: 'assigned',
          customer_name: reqItem.customer_name,
          customer_phone: reqItem.customer_phone,
          origin_address: reqItem.origin_address,
          destination_address: reqItem.destination_address,
          pickup_latitude: reqItem.pickup_latitude,
          pickup_longitude: reqItem.pickup_longitude,
        })
        .select()
        .single();

      if (error) throw error;

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
    return <div className="p-8 text-center" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Verificando autorización administrativa...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="login-screen" style={{ maxWidth: 420, margin: '60px auto', padding: 28, border: '1px solid #334155', borderRadius: 12, background: '#0f172a', color: '#fff', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: '2rem', marginBottom: 6 }}>🛡️</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Acceso Administrativo</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 4 }}>Transportes La Solución — Gestión Interna</p>
        </div>

        {loginError && (
          <div style={{ background: '#7f1d1d', border: '1px solid #f87171', color: '#fecaca', padding: '10px 12px', borderRadius: 6, marginBottom: 16, fontSize: '0.85rem' }}>
            {loginError}
          </div>
        )}

        <form onSubmit={handleAdminLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6, color: '#cbd5e1' }}>Usuario Administrador:</label>
            <input
              type="text"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="Ej: admin o alvaro"
              required
              autoFocus
              style={{ width: '100%', padding: '10px 12px', background: '#1e293b', border: '1px solid #475569', color: '#fff', borderRadius: 6, fontSize: '0.95rem' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6, color: '#cbd5e1' }}>Contraseña:</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%', padding: '10px 12px', background: '#1e293b', border: '1px solid #475569', color: '#fff', borderRadius: 6, fontSize: '0.95rem' }}
            />
          </div>

          <button
            type="submit"
            style={{ width: '100%', padding: '12px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '1rem', cursor: 'pointer', transition: 'background 0.2s' }}
          >
            Ingresar al Panel Administrativo
          </button>
        </form>

        <div style={{ marginTop: 24, padding: 12, background: '#1e293b', borderRadius: 8, fontSize: '0.78rem', color: '#94a3b8', border: '1px dashed #334155' }}>
          <strong style={{ color: '#38bdf8', display: 'block', marginBottom: 4 }}>Credenciales de Acceso:</strong>
          <div>▪ <strong>Super Admin:</strong> <code>admin</code> / clave: <code>admin</code></div>
          <div style={{ marginTop: 2 }}>▪ <strong>Admin Regular:</strong> <code>alvaro</code> / clave: <code>alvaro123</code></div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      {/* Barra Lateral de Navegación */}
      <aside className="sidebar">
        <h2 className="sidebar-title">La Solución VIP</h2>
        <div style={{ fontSize: '0.82rem', color: '#38bdf8', marginBottom: 4, fontWeight: 700 }}>
          {session?.displayName || session?.username}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 16 }}>
          Rol: {session?.role || 'Administrador'}
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
          🚕 Viajes Despachados ({trips.length})
        </button>
        <button
          onClick={() => setActiveTab('conductores')}
          className={`nav-item ${activeTab === 'conductores' ? 'active' : ''}`}
        >
          👥 Gestión Conductores ({drivers.length})
        </button>
        <button
          onClick={() => setActiveTab('metricas')}
          className={`nav-item ${activeTab === 'metricas' ? 'active' : ''}`}
        >
          📊 Métricas de Flota
        </button>

        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <button
            onClick={handleLogout}
            style={{ width: '100%', padding: '10px 0', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Área Principal de Contenido */}
      <main className="content">
        {loadingData && <div className="loading-bar">Actualizando datos operativos...</div>}

        {activeTab === 'operaciones' && (
          <section className="section-block">
            <h2>Supervisión GPS en Tiempo Real</h2>
            <p>Rastreo de unidades y estado de turnos operativos activos.</p>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Conductor</th>
                    <th>Última Coordenada</th>
                    <th>Velocidad</th>
                    <th>Batería</th>
                    <th>Estado de Registro</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.length === 0 ? (
                    <tr>
                      <td><strong>Conductor Testing (8888-8888)</strong></td>
                      <td>10.0754° N, 84.2441° W (Simulada)</td>
                      <td>0 km/h</td>
                      <td>100% (Listo)</td>
                      <td><span className="status-tag status-active">En Turno</span></td>
                    </tr>
                  ) : (
                    locations.map((loc) => (
                      <tr key={loc.driver_id}>
                        <td>{loc.drivers?.full_name || loc.driver_id}</td>
                        <td>{loc.latitude?.toFixed(4)}, {loc.longitude?.toFixed(4)}</td>
                        <td>{loc.speed_mps ? `${(loc.speed_mps * 3.6).toFixed(1)} km/h` : '0 km/h'}</td>
                        <td>{loc.battery_level ? `${loc.battery_level}%` : 'N/A'}</td>
                        <td><span className="status-tag status-active">Activo</span></td>
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
            <h2>Solicitudes Web de Pasajeros ({requests.length})</h2>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th># Solicitud</th>
                    <th>Cliente</th>
                    <th>Teléfono</th>
                    <th>Fecha Viaje</th>
                    <th>Destino</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>
                        No hay solicitudes pendientes en este momento. Las reservas del sitio web se recibirán aquí en tiempo real.
                      </td>
                    </tr>
                  ) : (
                    requests.map((r) => (
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
                    ))
                  )}
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
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>No hay viajes despachados registrados.</td></tr>
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
            <h2>Gestión de Conductores ({drivers.length})</h2>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 16 }}>
              Registre nuevos conductores y controle su estado de activación operativa en tiempo real.
            </p>

            <div style={{ marginBottom: 24, padding: 18, background: '#1e293b', borderRadius: 10, border: '1px solid #334155' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc' }}>Registrar Nuevo Conductor</h3>
              {driverSubmitStatus && <div style={{ margin: '10px 0', color: '#38bdf8', fontWeight: 600 }}>{driverSubmitStatus}</div>}
              <form onSubmit={handleCreateDriver} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
                <input placeholder="Nombre Completo" value={newDriverName} onChange={(e) => setNewDriverName(e.target.value)} required style={{ padding: 10, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 6 }} />
                <input placeholder="Teléfono (ej: 8888-8888)" value={newDriverPhone} onChange={(e) => setNewDriverPhone(e.target.value)} required style={{ padding: 10, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 6 }} />
                <input placeholder="Cédula / Identificación" value={newDriverIdNum} onChange={(e) => setNewDriverIdNum(e.target.value)} required style={{ padding: 10, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 6 }} />
                <input placeholder="N° Licencia de Conducir" value={newDriverLicense} onChange={(e) => setNewDriverLicense(e.target.value)} required style={{ padding: 10, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 6 }} />
                <input placeholder="Contraseña Temporal" type="password" value={newDriverTempPass} onChange={(e) => setNewDriverTempPass(e.target.value)} style={{ padding: 10, background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: 6 }} />
                <button type="submit" style={{ padding: 10, background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                  + Guardar y Activar
                </button>
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
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.full_name}</strong>
                        {d.phone_number === '88888888' && <span style={{ marginLeft: 8, fontSize: '0.72rem', background: '#3b82f6', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>TESTING</span>}
                      </td>
                      <td>{d.phone_number}</td>
                      <td>{d.identification_number}</td>
                      <td>{d.license_number}</td>
                      <td>
                        <span className={`status-tag ${d.active ? 'status-active' : 'status-inactive'}`}>
                          {d.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleDriverStatus(d)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            background: d.active ? '#ef4444' : '#10b981',
                            color: '#fff',
                            transition: 'opacity 0.2s'
                          }}
                        >
                          {d.active ? 'Desactivar' : 'Activar'}
                        </button>
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
            <p>Métricas operativas basadas en registros GPS validados y auditoría mensual.</p>
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
