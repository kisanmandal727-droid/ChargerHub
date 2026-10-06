import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, MapPin, Trash2, CheckCircle } from 'lucide-react';
import { api } from '../../api/client.js';

export default function ReservationsModal({ isOpen, onClose, connectorToBook, onBookSuccess }) {
  const [reservations, setReservations] = useState([]);
  const [duration, setDuration] = useState(30);
  const [booking, setBooking] = useState(false);
  const [deletingReservationId, setDeletingReservationId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchReservations = async () => {
    setHistoryError('');
    try {
      const res = await api.get('/reservations');
      setReservations(res.reservations || []);
    } catch (err) {
      console.error(err);
      setHistoryError(err.message || 'Booking history could not be loaded.');
    }
  };

  useEffect(() => {
    if (isOpen) fetchReservations();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBook = async (e) => {
    e.preventDefault();
    if (!connectorToBook) return;

    setBooking(true);
    setErrorMsg('');
    try {
      const startTime = new Date();
      await api.post('/reservations', {
        connector_id: connectorToBook.id,
        start_time: startTime.toISOString(),
        duration_minutes: duration
      });
      setSuccessMsg(`Slot reserved at ${connectorToBook.charger_name}!`);
      await fetchReservations();
      setTimeout(() => {
        setSuccessMsg('');
        if (onBookSuccess) onBookSuccess();
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to book slot');
    } finally {
      setBooking(false);
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this reservation?')) return;
    setHistoryError('');
    try {
      await api.delete(`/reservations/${id}`);
      await fetchReservations();
    } catch (err) {
      setHistoryError(err.message || 'Could not cancel this reservation.');
    }
  };

  const handleDeleteHistory = async (reservation) => {
    if (!confirm('Delete this booking from your history? This cannot be undone.')) return;
    setDeletingReservationId(reservation.id);
    setHistoryError('');
    try {
      await api.delete(`/reservations/${reservation.id}/history`);
      await fetchReservations();
    } catch (err) {
      setHistoryError(err.message || 'Could not delete this booking from history.');
    } finally {
      setDeletingReservationId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '80vh' }}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#151C38' }}>
              {connectorToBook ? 'Reserve Connector Slot' : 'My Reservations'}
            </h3>
            <p style={{ fontSize: '12px', color: '#68718B' }}>
              {connectorToBook ? 'Guarantee your charger before arriving' : 'Your upcoming bookings and past reservation history'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#F1F4FA', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={18} color="#151C38" />
          </button>
        </div>

        {connectorToBook && !successMsg && (
          <form onSubmit={handleBook} style={{ marginBottom: '24px', background: '#F8FAFC', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#151C38', marginBottom: '4px' }}>
              {connectorToBook.charger_name}
            </div>
            <div style={{ fontSize: '11px', color: '#68718B', marginBottom: '14px' }}>
              {connectorToBook.power_kw}kW • {connectorToBook.connector_type}
            </div>

            <label style={{ fontSize: '11px', fontWeight: 700, color: '#68718B', display: 'block', marginBottom: '6px' }}>
              RESERVATION DURATION
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
              {[15, 30, 45].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDuration(mins)}
                  style={{
                    padding: '8px',
                    borderRadius: '10px',
                    border: duration === mins ? '2px solid #00C896' : '1px solid #CBD5E1',
                    background: duration === mins ? '#E0FBF4' : '#FFFFFF',
                    color: duration === mins ? '#007A5C' : '#151C38',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {mins} Mins
                </button>
              ))}
            </div>

            {errorMsg && (
              <p style={{ color: '#EF4444', fontSize: '12px', fontWeight: 600, marginBottom: '10px' }}>
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={booking}
              className="btn-primary"
              style={{ background: '#00C896', padding: '12px' }}
            >
              {booking ? 'Reserving...' : `Confirm Reservation (${duration} mins)`}
            </button>
          </form>
        )}

        {successMsg && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#10B981', fontWeight: 700, fontSize: '14px' }}>
            <CheckCircle size={40} style={{ margin: '0 auto 8px' }} />
            {successMsg}
          </div>
        )}

        <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#151C38', marginBottom: '10px' }}>
          Booking History ({reservations.length})
        </h4>
        {historyError && <p role="alert" style={{ color: '#B42318', fontSize: '12px', marginBottom: '10px' }}>{historyError}</p>}

        {reservations.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#68718B' }}>No reservations yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reservations.map((r) => {
              const isCurrent = r.status === 'Active' && new Date(r.end_time).getTime() > Date.now();
              const statusLabel = r.status === 'Active' && !isCurrent ? 'Expired' : r.status;
              return (
              <div
                key={r.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>{r.charger_name}</div>
                  <div style={{ fontSize: '11px', color: '#68718B' }}>
                    {new Date(r.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {r.duration_minutes} mins
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`status-pill ${isCurrent ? 'available' : 'offline'}`}>
                    {statusLabel}
                  </span>
                  {isCurrent ? (
                    <button
                      type="button"
                      onClick={() => handleCancel(r.id)}
                      aria-label="Cancel reservation"
                      title="Cancel reservation"
                      style={{ background: 'none', border: 'none', color: '#EF4444', padding: '4px', cursor: 'pointer' }}
                    >
                      <X size={17} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDeleteHistory(r)}
                      disabled={deletingReservationId === r.id}
                      aria-label="Delete booking history"
                      title="Delete from booking history"
                      style={{ background: 'none', border: 'none', color: '#EF4444', padding: '4px', cursor: deletingReservationId === r.id ? 'wait' : 'pointer', opacity: deletingReservationId === r.id ? 0.55 : 1 }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
