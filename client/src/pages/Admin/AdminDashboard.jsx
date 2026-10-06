import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Shield, Zap, Users, Radio, Power, CheckCircle, RefreshCw, MessageCircle, Send, Trash2, MapPin, Plus, Pencil, ChevronRight } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const emptyStationForm = {
  name: '', address: '', city: 'Pune', latitude: '', longitude: '',
  charger_name: '', connector_name: 'Connector 1', connector_type: 'CCS2', current_type: 'DC',
  power_kw: '30', price_per_kwh: '21'
};

export default function AdminDashboard({ onBack }) {
  const { user: currentUser, logout } = useAuth();
  const [activePage, setActivePage] = useState('overview');
  const [metrics, setMetrics] = useState(null);
  const [stations, setStations] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [users, setUsers] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingTicketId, setUpdatingTicketId] = useState(null);
  const [supportReplyDrafts, setSupportReplyDrafts] = useState({});
  const [sendingSupportReplyId, setSendingSupportReplyId] = useState(null);
  const [deletingSupportChatId, setDeletingSupportChatId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [stationForm, setStationForm] = useState(emptyStationForm);
  const [editingStationId, setEditingStationId] = useState(null);
  const stationFormRef = useRef(null);
  const [stationFormError, setStationFormError] = useState('');
  const [savingStation, setSavingStation] = useState(false);
  const [stationActionId, setStationActionId] = useState(null);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [mData, sData, sessData, uData, supportData] = await Promise.all([
        api.get('/admin/metrics'),
        api.get('/admin/stations'),
        api.get('/admin/sessions'),
        api.get('/admin/users'),
        api.get('/admin/support/tickets')
      ]);
      setMetrics(mData.metrics);
      setStations(sData.stations || []);
      setSessions(sessData.sessions || []);
      setUsers(uData.users || []);
      setSupportTickets(supportData.tickets || []);
      setSelectedStationId((current) => {
        const active = (sData.stations || []).filter((station) => station.is_active !== false);
        return active.some((station) => Number(station.id) === Number(current)) ? current : (active[0]?.id || null);
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  useEffect(() => {
    if (editingStationId !== null) stationFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [editingStationId]);

  const handleStatusChange = async (connectorId, newStatus) => {
    setUpdatingId(connectorId);
    try {
      await api.put(`/admin/connectors/${connectorId}/status`, { status: newStatus });
      await fetchAdminData();
    } catch (err) {
      alert(err.message || 'Status update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleTicketStatusChange = async (ticketId, status) => {
    setUpdatingTicketId(ticketId);
    try {
      const result = await api.put(`/admin/support/tickets/${ticketId}/status`, { status });
      setSupportTickets((current) => current.map((ticket) => ticket.id === ticketId ? result.ticket : ticket));
    } catch (err) {
      alert(err.message || 'Could not update support request');
    } finally {
      setUpdatingTicketId(null);
    }
  };

  const handleSupportReply = async (ticketId) => {
    const text = String(supportReplyDrafts[ticketId] || '').trim();
    if (!text || sendingSupportReplyId) return;
    setSendingSupportReplyId(ticketId);
    try {
      const result = await api.post(`/admin/support/tickets/${ticketId}/messages`, { text });
      setSupportTickets((current) => current.map((ticket) => ticket.id === ticketId ? result.ticket : ticket));
      setSupportReplyDrafts((current) => ({ ...current, [ticketId]: '' }));
    } catch (err) {
      alert(err.message || 'Could not send the admin reply');
    } finally {
      setSendingSupportReplyId(null);
    }
  };

  const handleDeleteSupportChat = async (ticketId) => {
    if (!window.confirm('Delete this conversation and all its messages for the user and admin? This cannot be undone.')) return;
    setDeletingSupportChatId(ticketId);
    try {
      await api.delete(`/admin/support/tickets/${ticketId}`);
      setSupportTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
    } catch (err) {
      alert(err.message || 'Could not delete this conversation');
    } finally {
      setDeletingSupportChatId(null);
    }
  };

  const handleDeleteUser = async (registeredUser) => {
    const userLabel = registeredUser.email || registeredUser.name || 'this user';
    const isCurrentUser = Number(currentUser?.id) === Number(registeredUser.id);
    const confirmation = isCurrentUser
      ? `Permanently delete ${userLabel} and all of this account's ChargerHub data? You will be signed out, and this cannot be undone.`
      : `Permanently delete ${userLabel} from Firebase Authentication and remove their ChargerHub profile, vehicles, wallet and payment history, trips, reservations, orders, notifications, and support chats? This cannot be undone.`;
    if (!window.confirm(confirmation)) return;

    setDeletingUserId(registeredUser.id);
    try {
      const result = await api.delete(`/admin/users/${registeredUser.id}`);
      setUsers((current) => current.filter((item) => Number(item.id) !== Number(registeredUser.id)));
      if (isCurrentUser) {
        alert(result.message || 'Your account and its ChargerHub data were deleted.');
        logout();
        onBack?.();
      } else {
        await fetchAdminData();
      }
    } catch (err) {
      alert(err.message || 'Could not delete this registered user.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const resetStationForm = () => {
    setStationForm(emptyStationForm);
    setEditingStationId(null);
    setStationFormError('');
  };

  const handleSaveStation = async (event) => {
    event.preventDefault();
    if (savingStation) return;
    setSavingStation(true);
    setStationFormError('');
    try {
      const stationDetails = {
        name: stationForm.name,
        address: stationForm.address,
        city: stationForm.city,
        latitude: Number(stationForm.latitude),
        longitude: Number(stationForm.longitude)
      };
      if (editingStationId !== null) {
        const result = await api.put(`/admin/stations/${editingStationId}`, stationDetails);
        setStations((current) => current.map((station) => Number(station.id) === Number(editingStationId) ? result.station : station));
        setSelectedStationId(result.station.id);
      } else {
        const result = await api.post('/admin/stations', {
          ...stationDetails,
          charger_name: stationForm.charger_name,
          connector_name: stationForm.connector_name,
          connector_type: stationForm.connector_type,
          current_type: stationForm.current_type,
          power_kw: Number(stationForm.power_kw),
          price_per_kwh: Number(stationForm.price_per_kwh)
        });
        setStations((current) => [...current, result.station].sort((a, b) => a.name.localeCompare(b.name)));
        setSelectedStationId(result.station.id);
        setMetrics((current) => current ? { ...current, totalStations: current.totalStations + 1, totalConnectors: current.totalConnectors + 1 } : current);
      }
      resetStationForm();
    } catch (err) {
      setStationFormError(err.message || 'Could not save the station.');
    } finally {
      setSavingStation(false);
    }
  };

  const handleEditStation = (station) => {
    setEditingStationId(station.id);
    setStationForm({
      ...emptyStationForm,
      name: station.name || '',
      address: station.address || '',
      city: station.city || '',
      latitude: String(station.latitude ?? ''),
      longitude: String(station.longitude ?? '')
    });
    setStationFormError('');
  };

  const handleDeleteStation = async (station) => {
    if (!window.confirm(`Permanently delete “${station.name}”? It will disappear from the map, saved stations, saved trips, reservations, and payment history details. Charging and payment totals will be kept. This cannot be undone.`)) return;
    const isActive = station.is_active !== false;
    setStationActionId(station.id);
    try {
      await api.delete(`/admin/stations/${station.id}`);
      setStations((current) => current.filter((item) => Number(item.id) !== Number(station.id)));
      setMetrics((current) => current ? {
        ...current,
        totalStations: Math.max(0, current.totalStations - (isActive ? 1 : 0)),
        totalConnectors: Math.max(0, current.totalConnectors - (isActive ? (station.connectors?.length || 0) : 0))
      } : current);
      if (Number(selectedStationId) === Number(station.id)) {
        const nextStation = stations.find((item) => Number(item.id) !== Number(station.id) && item.is_active !== false);
        setSelectedStationId(nextStation?.id || null);
      }
      if (Number(editingStationId) === Number(station.id)) resetStationForm();
    } catch (err) {
      alert(err.message || 'Could not delete this station.');
    } finally {
      setStationActionId(null);
    }
  };

  const activeStations = stations.filter((station) => station.is_active !== false);
  const selectedStation = activeStations.find((station) => Number(station.id) === Number(selectedStationId)) || activeStations[0];
  const pageTitles = {
    overview: ['Admin overview', 'Manage ChargerHub from one place'],
    stations: ['Charging stations', 'Manage stations shown on the map'],
    sessions: ['Charging sessions', 'Review ongoing charging activity'],
    users: ['Registered users', 'Manage user profiles and fleet data'],
    support: ['Help requests', 'Reply to users and manage support chats'],
    simulator: ['Charger simulator', 'Change demo connector status']
  };
  const activeSessionRows = sessions.filter((session) => ['initiating', 'charging', 'paused'].includes(String(session.status).toLowerCase()));
  const overviewLinks = [
    { id: 'stations', title: 'Charging Stations on the Map', detail: `${activeStations.length} stations · edit locations and chargers`, icon: MapPin, color: '#087E63' },
    { id: 'sessions', title: 'Ongoing Charging Sessions', detail: `${activeSessionRows.length} currently active`, icon: Zap, color: '#D97706' },
    { id: 'users', title: 'Registered Users', detail: `${users.length} user profiles`, icon: Users, color: '#2563EB' },
    { id: 'support', title: 'Help Requests', detail: `${supportTickets.filter((ticket) => ticket.status !== 'resolved').length} need attention`, icon: MessageCircle, color: '#7C3AED' },
    { id: 'simulator', title: 'Charger Simulator', detail: 'Set demo chargers to available, busy, or offline', icon: Radio, color: '#DB2777' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC' }}>
      {/* Top Header */}
      <div style={{
        background: '#151C38',
        color: '#FFFFFF',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => activePage === 'overview' ? onBack() : setActivePage('overview')}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', cursor: 'pointer' }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800 }}>{pageTitles[activePage][0]}</h2>
            <p style={{ fontSize: '11px', color: '#94A3B8' }}>{pageTitles[activePage][1]}</p>
          </div>
        </div>

        <button
          onClick={fetchAdminData}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '10px', padding: '6px', color: '#FFFFFF', cursor: 'pointer' }}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 90px' }}>
        {activePage === 'overview' && <>
        <div style={{ marginBottom: '18px' }}>
          <h3 style={{ margin: '0 0 5px', fontSize: '14px', color: '#151C38', fontWeight: 800 }}>Platform summary</h3>
          <p style={{ margin: 0, color: '#68718B', fontSize: '12px' }}>Choose an area below to manage its details.</p>
        </div>
        {/* Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px', marginBottom: '22px' }}>
          <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#68718B' }}>TOTAL STATIONS</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#151C38', marginTop: '2px' }}>
              {metrics?.totalStations || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#10B981', fontWeight: 600 }}>
              {metrics?.totalConnectors || 0} Connectors
            </div>
          </div>

          <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#68718B' }}>ACTIVE SESSIONS</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#00C896', marginTop: '2px' }}>
              {metrics?.activeSessions || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#68718B', fontWeight: 600 }}>
              {metrics?.totalEnergyDispensedKwh || 0} kWh Delivered
            </div>
          </div>

          <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#68718B' }}>TOTAL REGISTERED USERS</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#151C38', marginTop: '2px' }}>
              {metrics?.totalUsers || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#68718B', fontWeight: 600 }}>
              {metrics?.totalVehicles || 0} Registered EVs
            </div>
          </div>

          <div style={{ background: '#FFFFFF', padding: '14px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#68718B' }}>TOTAL REVENUE</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#10B981', marginTop: '2px' }}>
              ₹{metrics?.totalRevenueInr || 0}
            </div>
            <div style={{ fontSize: '11px', color: '#68718B', fontWeight: 600 }}>
              Phase 1 Simulation
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '10px' }}>
          {overviewLinks.map(({ id, title, detail, icon: Icon, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActivePage(id)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '15px', border: '1px solid #E2E8F0', borderRadius: '16px', background: '#FFFFFF', textAlign: 'left', cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,23,42,0.03)' }}
            >
              <span style={{ width: '42px', height: '42px', flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '13px', color, background: `${color}12` }}><Icon size={20} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: '#151C38', fontSize: '13px', fontWeight: 800 }}>{title}</span>
                <span style={{ display: 'block', marginTop: '4px', color: '#68718B', fontSize: '11px', lineHeight: 1.35 }}>{detail}</span>
              </span>
              <ChevronRight size={18} color="#94A3B8" />
            </button>
          ))}
        </div>
        </>}

        {/* Manage the real station records shown on the map */}
        {activePage === 'stations' && <>
        <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '18px', border: '1px solid #EAEFF6', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
            <MapPin size={18} color="#00A87E" />
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#151C38' }}>Charging Stations on the Map</h3>
          </div>
          <p style={{ fontSize: '12px', color: '#68718B', marginBottom: '14px' }}>
            Edit a station to correct its location or details. Permanent deletion removes it from user pages and saved data while keeping charging and payment totals.
          </p>

          {editingStationId !== null && <div role="status" style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', fontSize: '12px', fontWeight: 700 }}>
            Editing “{stationForm.name}” — correct the details below, then click Save station details.
          </div>}
          <form ref={stationFormRef} onSubmit={handleSaveStation} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', padding: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', marginBottom: '14px', scrollMarginTop: '90px' }}>
            <label style={stationFieldStyle}>Station name
              <input required maxLength={120} value={stationForm.name} onChange={(event) => setStationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Example: ChargerHub City Center" style={stationInputStyle} />
            </label>
            <label style={stationFieldStyle}>City
              <input required maxLength={80} value={stationForm.city} onChange={(event) => setStationForm((current) => ({ ...current, city: event.target.value }))} placeholder="Pune" style={stationInputStyle} />
            </label>
            <label style={{ ...stationFieldStyle, gridColumn: '1 / -1' }}>Street address
              <input required maxLength={240} value={stationForm.address} onChange={(event) => setStationForm((current) => ({ ...current, address: event.target.value }))} placeholder="Building, road, area" style={stationInputStyle} />
            </label>
            <label style={stationFieldStyle}>Latitude
              <input required type="number" min="-90" max="90" step="any" value={stationForm.latitude} onChange={(event) => setStationForm((current) => ({ ...current, latitude: event.target.value }))} placeholder="18.5204" style={stationInputStyle} />
            </label>
            <label style={stationFieldStyle}>Longitude
              <input required type="number" min="-180" max="180" step="any" value={stationForm.longitude} onChange={(event) => setStationForm((current) => ({ ...current, longitude: event.target.value }))} placeholder="73.8567" style={stationInputStyle} />
            </label>
            {editingStationId === null && <>
              <label style={stationFieldStyle}>Charger name
                <input required maxLength={120} value={stationForm.charger_name} onChange={(event) => setStationForm((current) => ({ ...current, charger_name: event.target.value }))} placeholder="Fast Charger 1" style={stationInputStyle} />
              </label>
              <label style={stationFieldStyle}>Connector label
                <input required maxLength={80} value={stationForm.connector_name} onChange={(event) => setStationForm((current) => ({ ...current, connector_name: event.target.value }))} placeholder="Connector 1" style={stationInputStyle} />
              </label>
              <label style={stationFieldStyle}>Plug type
                <select value={stationForm.connector_type} onChange={(event) => setStationForm((current) => ({ ...current, connector_type: event.target.value }))} style={stationInputStyle}>
                  <option>CCS2</option><option>Type 2</option><option>Wall Socket</option><option>CHAdeMO</option>
                </select>
              </label>
              <label style={stationFieldStyle}>Power (kW)
                <input required type="number" min="0.1" step="0.1" value={stationForm.power_kw} onChange={(event) => setStationForm((current) => ({ ...current, power_kw: event.target.value }))} style={stationInputStyle} />
              </label>
              <label style={stationFieldStyle}>Current type
                <select value={stationForm.current_type} onChange={(event) => setStationForm((current) => ({ ...current, current_type: event.target.value }))} style={stationInputStyle}><option value="AC">AC</option><option value="DC">DC</option></select>
              </label>
              <label style={stationFieldStyle}>Price (₹/kWh)
                <input required type="number" min="0.01" step="0.01" value={stationForm.price_per_kwh} onChange={(event) => setStationForm((current) => ({ ...current, price_per_kwh: event.target.value }))} style={stationInputStyle} />
              </label>
            </>}
            {stationFormError && <p role="alert" style={{ gridColumn: '1 / -1', color: '#B91C1C', fontSize: '12px' }}>{stationFormError}</p>}
            <button type="submit" disabled={savingStation} className="btn-primary" style={{ gridColumn: editingStationId === null ? '1 / -1' : '1', background: '#087E63', opacity: savingStation ? 0.7 : 1 }}>
              {editingStationId === null ? <Plus size={16} /> : <Pencil size={16} />} {savingStation ? 'Saving…' : editingStationId === null ? 'Add station and charger' : 'Save station details'}
            </button>
            {editingStationId !== null && <button type="button" disabled={savingStation} onClick={resetStationForm} style={{ border: '1px solid #CBD5E1', borderRadius: '10px', padding: '10px 12px', background: '#FFFFFF', color: '#475569', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Cancel edit</button>}
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {stations.length === 0 ? <p style={{ color: '#68718B', fontSize: '12px' }}>No stations are configured yet.</p> : [...stations].sort((a, b) => a.name.localeCompare(b.name)).map((station) => {
              const isActive = station.is_active !== false;
              return <div key={station.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 12px', borderRadius: '12px', border: '1px solid #E2E8F0', background: isActive ? '#FFFFFF' : '#F8FAFC' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <strong style={{ color: '#151C38', fontSize: '12px' }}>{station.name}</strong>
                    <span style={{ color: isActive ? '#047857' : '#64748B', background: isActive ? '#DCFCE7' : '#E2E8F0', borderRadius: '999px', padding: '3px 7px', fontSize: '9px', fontWeight: 800 }}>{isActive ? 'On map' : 'Removed'}</span>
                  </div>
                  <p style={{ color: '#68718B', fontSize: '10px', marginTop: '3px' }}>{station.city} · {station.latitude}, {station.longitude} · {station.connectors?.length || 0} charger(s)</p>
                </div>
                <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: '6px' }}>
                  <button type="button" disabled={savingStation || stationActionId === station.id} onClick={() => handleEditStation(station)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', border: '1px solid #BFDBFE', borderRadius: '9px', padding: '7px 9px', background: '#EFF6FF', color: '#1D4ED8', fontSize: '10px', fontWeight: 800, cursor: 'pointer' }}>
                    <Pencil size={13} /> Edit
                  </button>
                  <button type="button" disabled={stationActionId === station.id} onClick={() => handleDeleteStation(station)} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', border: '1px solid #FECACA', borderRadius: '9px', padding: '7px 9px', background: '#FEF2F2', color: '#B91C1C', fontSize: '10px', fontWeight: 800, cursor: 'pointer', opacity: stationActionId === station.id ? 0.6 : 1 }}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>;
            })}
          </div>
        </div>
        </>}

        {/* Live Charger Hardware Status Controller */}
        {activePage === 'simulator' && <>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '18px',
          border: '1px solid #EAEFF6',
          marginBottom: '20px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Radio size={18} color="#00C896" />
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#151C38' }}>
              Simulated Charger Status Override
            </h3>
          </div>
          <p style={{ fontSize: '12px', color: '#68718B', marginBottom: '14px' }}>
            Test hardware status changes in real time. Changes reflect immediately on the Leaflet Map and station views.
          </p>

          {/* Station Selector Dropdown */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: '#68718B', display: 'block', marginBottom: '6px' }}>
              SELECT STATION
            </label>
            <select
              value={selectedStationId || ''}
              onChange={(e) => setSelectedStationId(Number(e.target.value))}
              style={{
                width: '100%',
                background: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '12px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#151C38'
              }}
            >
              {activeStations.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.connectors?.length || 0} Connectors)
                </option>
              ))}
            </select>
          </div>

          {/* Connectors for chosen station */}
          {selectedStation && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedStation.connectors?.map((conn) => (
                <div
                  key={conn.id}
                  style={{
                    background: '#F8FAFC',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    border: '1px solid #E2E8F0'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>
                        {conn.charger_name} ({conn.power_kw}kW {conn.connector_type})
                      </div>
                      <div style={{ fontSize: '11px', color: '#68718B' }}>{conn.connector_name}</div>
                    </div>
                    <span className={`status-pill ${conn.status === 'Available' ? 'available' : conn.status === 'Busy' ? 'busy' : 'offline'}`}>
                      {conn.status}
                    </span>
                  </div>

                  {/* Status buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {['Available', 'Busy', 'Offline', 'Faulted'].map((stat) => (
                      <button
                        key={stat}
                        type="button"
                        disabled={updatingId === conn.id}
                        onClick={() => handleStatusChange(conn.id, stat)}
                        style={{
                          padding: '6px 2px',
                          borderRadius: '8px',
                          border: conn.status === stat ? '2px solid #151C38' : '1px solid #CBD5E1',
                          background: conn.status === stat ? '#151C38' : '#FFFFFF',
                          color: conn.status === stat ? '#FFFFFF' : '#151C38',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {stat}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </>}

        {/* User requests escalated from the in-app help assistant */}
        {activePage === 'support' && <>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '18px',
          border: '1px solid #EAEFF6',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <MessageCircle size={18} color="#00A87E" />
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#151C38' }}>
              Help Requests ({supportTickets.filter((ticket) => ticket.status !== 'resolved').length} open)
            </h3>
          </div>
          <p style={{ fontSize: '12px', color: '#68718B', marginBottom: '12px' }}>
            Users’ saved help chats appear here after they choose Talk to Admin. Replies are saved and appear in the user’s chat. Use the refresh button above to check for new messages.
          </p>

          {supportTickets.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#68718B' }}>No help requests yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {supportTickets.map((ticket) => (
                <article key={ticket.id} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '7px' }}>
                    <div>
                      <div style={{ color: '#151C38', fontSize: '12px', fontWeight: 800 }}>
                        {ticket.reference} · {ticket.user_name || 'ChargerHub user'}
                      </div>
                      <div style={{ color: '#68718B', fontSize: '11px', marginTop: '3px' }}>
                        {ticket.user_email || 'No email'} · {ticket.created_at ? new Date(ticket.created_at).toLocaleString() : 'Recently submitted'}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, color: ticket.status === 'resolved' ? '#047857' : '#92400E', background: ticket.status === 'resolved' ? '#DCFCE7' : '#FEF3C7', borderRadius: '999px', padding: '4px 8px', fontSize: '10px', fontWeight: 800 }}>
                      {ticket.status === 'in_progress' ? 'In progress' : ticket.status}
                    </span>
                  </div>
                  <p style={{ color: '#334155', fontSize: '13px', lineHeight: 1.45, whiteSpace: 'pre-wrap', marginBottom: '8px' }}>{ticket.message}</p>
                  {ticket.conversation?.length > 0 && (
                    <details style={{ marginBottom: '10px', color: '#475569', fontSize: '11px' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Recent chat context ({ticket.conversation.length} messages)</summary>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        {ticket.conversation.map((entry, index) => (
                          <p key={`${ticket.id}-context-${index}`} style={{ lineHeight: 1.4 }}><strong>{entry.role === 'user' ? 'User' : 'Assistant'}:</strong> {entry.text}</p>
                        ))}
                      </div>
                    </details>
                  )}
                  {ticket.messages?.length > 0 && (
                    <div aria-label="Saved conversation messages" style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '260px', overflowY: 'auto', padding: '8px', margin: '8px 0', borderRadius: '12px', background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                      {ticket.messages.map((message) => {
                        const fromAdmin = message.role === 'admin';
                        return (
                          <div key={message.id} style={{ alignSelf: fromAdmin ? 'flex-end' : 'flex-start', maxWidth: '90%', padding: '8px 10px', borderRadius: '11px', background: fromAdmin ? '#DCFCE7' : '#F1F5F9', color: '#334155', fontSize: '12px', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            <strong style={{ display: 'block', fontSize: '10px', color: fromAdmin ? '#047857' : '#64748B', marginBottom: '3px' }}>{fromAdmin ? 'Admin' : message.role === 'assistant' ? 'ChargerHub Assistant' : ticket.user_name || 'User'} · {message.created_at ? new Date(message.created_at).toLocaleString() : ''}</strong>
                            {message.text}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <form onSubmit={(event) => { event.preventDefault(); handleSupportReply(ticket.id); }} style={{ display: 'flex', alignItems: 'flex-end', gap: '7px', margin: '10px 0' }}>
                    <textarea
                      value={supportReplyDrafts[ticket.id] || ''}
                      onChange={(event) => setSupportReplyDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
                      maxLength={1500}
                      rows={2}
                      placeholder="Reply to this user…"
                      aria-label={`Reply to ${ticket.user_name || 'user'}`}
                      style={{ flex: 1, minWidth: 0, resize: 'vertical', boxSizing: 'border-box', padding: '9px 10px', border: '1px solid #CBD5E1', borderRadius: '10px', fontSize: '12px', color: '#151C38', background: '#FFFFFF' }}
                    />
                    <button type="submit" disabled={!String(supportReplyDrafts[ticket.id] || '').trim() || sendingSupportReplyId === ticket.id} title="Send reply" aria-label="Send reply" style={{ display: 'grid', placeItems: 'center', width: '36px', height: '36px', flexShrink: 0, border: 0, borderRadius: '10px', background: '#087E63', color: '#FFFFFF', cursor: 'pointer', opacity: sendingSupportReplyId === ticket.id ? 0.6 : 1 }}>
                      <Send size={16} />
                    </button>
                  </form>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      ['open', 'Open'],
                      ['in_progress', 'In progress'],
                      ['resolved', 'Resolved']
                    ].map(([status, label]) => (
                      <button
                        key={status}
                        type="button"
                        disabled={updatingTicketId === ticket.id || ticket.status === status}
                        onClick={() => handleTicketStatusChange(ticket.id, status)}
                        style={{
                          border: '1px solid #CBD5E1', borderRadius: '8px', padding: '6px 9px', fontSize: '10px', fontWeight: 700,
                          background: ticket.status === status ? '#151C38' : '#FFFFFF', color: ticket.status === status ? '#FFFFFF' : '#334155',
                          opacity: updatingTicketId === ticket.id ? 0.6 : 1, cursor: ticket.status === status ? 'default' : 'pointer'
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={deletingSupportChatId === ticket.id}
                      onClick={() => handleDeleteSupportChat(ticket.id)}
                      style={{ border: '1px solid #FECACA', borderRadius: '8px', padding: '6px 9px', fontSize: '10px', fontWeight: 700, background: '#FEF2F2', color: '#B91C1C', opacity: deletingSupportChatId === ticket.id ? 0.6 : 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Trash2 size={13} /> Delete chat
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        </>}

        {/* Active Charging Sessions Monitor */}
        {activePage === 'sessions' && <>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '18px',
          border: '1px solid #EAEFF6',
          marginBottom: '20px'
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#151C38', marginBottom: '10px' }}>
            Ongoing Charging Sessions ({activeSessionRows.length})
          </h3>

          {activeSessionRows.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#68718B' }}>There are no ongoing charging sessions right now.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeSessionRows.map((sess) => (
                <div
                  key={sess.id}
                  style={{
                    background: '#F8FAFC',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>
                      {sess.user_name} • {sess.charger_name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#68718B' }}>
                      SoC: {sess.current_soc_pct}% • {sess.energy_delivered_kwh} kWh • ₹{sess.total_cost}
                    </div>
                  </div>
                  <span className={`status-pill ${sess.status === 'charging' ? 'busy' : 'available'}`}>
                    {sess.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        </>}

        {/* Registered Users & Fleet Overview */}
        {activePage === 'users' && <>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '18px',
          border: '1px solid #EAEFF6'
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#151C38', marginBottom: '10px' }}>
            Registered Users ({users.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {users.length === 0 && <p style={{ color: '#68718B', fontSize: '12px' }}>No registered users yet.</p>}
            {users.map((u) => (
              <div
                key={u.id}
                className="admin-user-card"
                style={{
                  background: '#F8FAFC',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div className="admin-user-info">
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>
                    {u.name} ({u.role})
                  </div>
                  <div style={{ fontSize: '11px', color: '#68718B' }}>
                    {u.email} • {u.vehicle_count} EV(s)
                  </div>
                </div>
                <div className="admin-user-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '7px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#10B981' }}>
                      ₹{parseFloat(u.wallet_balance || 0).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#68718B' }}>{u.wallet_coins || 0} Coins</div>
                  </div>
                  <button
                    type="button"
                    className="admin-user-delete"
                    onClick={() => handleDeleteUser(u)}
                    disabled={deletingUserId !== null}
                    aria-label={`Delete ${u.email || u.name}`}
                    title="Permanently delete this user and their ChargerHub data"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #FECACA', borderRadius: '8px', background: '#FEF2F2', color: '#B91C1C', padding: '5px 8px', fontSize: '10px', fontWeight: 800, cursor: deletingUserId !== null ? 'not-allowed' : 'pointer', opacity: deletingUserId !== null && deletingUserId !== u.id ? 0.5 : 1 }}
                  >
                    <Trash2 size={12} /> {deletingUserId === u.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>}
      </div>
    </div>
  );
}

const stationFieldStyle = {
  display: 'flex', flexDirection: 'column', gap: '5px', color: '#475569', fontSize: '10px', fontWeight: 800
};

const stationInputStyle = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '9px 10px', border: '1px solid #CBD5E1', borderRadius: '9px',
  background: '#FFFFFF', color: '#151C38', fontSize: '12px', fontWeight: 500
};
