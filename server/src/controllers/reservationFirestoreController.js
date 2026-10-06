import db from '../db/firestore.js';

export const createReservation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { connector_id, start_time, duration_minutes = 30 } = req.body;
    if (!connector_id || !start_time) return res.status(400).json({ error: 'connector_id and start_time are required' });
    const start = new Date(start_time);
    const duration = Number(duration_minutes);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(duration) || duration <= 0) return res.status(400).json({ error: 'Enter a valid time and duration' });
    const end = new Date(start.getTime() + duration * 60000);
    const connector = await db.get('connectors', connector_id);
    if (!connector) return res.status(404).json({ error: 'Connector not found' });
    const station = await db.get('stations', connector.station_id);
    if (!station || station.is_active === false) return res.status(404).json({ error: 'This charging station is no longer available' });
    if (['Offline', 'Faulted'].includes(connector.status)) return res.status(400).json({ error: `Cannot reserve connector in ${connector.status} status` });
    const conflicts = (await db.where('reservations', 'connector_id', Number(connector_id))).filter((item) => item.status === 'Active' && new Date(item.start_time) < end && new Date(item.end_time) > start);
    if (conflicts.length) return res.status(409).json({ error: 'This connector is already reserved for the selected time slot. Please pick another time or connector.' });
    const reservation = await db.create('reservations', { user_id: userId, connector_id: Number(connector_id), start_time: start.toISOString(), end_time: end.toISOString(), duration_minutes: duration, status: 'Active' });
    const now = new Date();
    if (start <= now && end > now) await db.update('connectors', connector_id, { status: 'Reserved' });
    await db.create('notifications', { user_id: userId, title: 'Connector Reserved 📅', message: `Slot reserved at ${connector.charger_name} from ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`, type: 'charging', is_read: false });
    return res.status(201).json({ message: 'Reservation confirmed', reservation });
  } catch (err) {
    console.error('Reservation error:', err);
    return res.status(500).json({ error: 'Failed to create reservation' });
  }
};

export const getMyReservations = async (req, res) => {
  try {
    const rows = await db.where('reservations', 'user_id', Number(req.user.id));
    rows.sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)));
    const reservations = [];
    for (const reservation of rows) {
      const connector = await db.get('connectors', reservation.connector_id);
      if (!connector) continue;
      const station = await db.get('stations', connector.station_id);
      reservations.push({ ...reservation, charger_name: connector.charger_name, connector_name: connector.connector_name, connector_type: connector.connector_type, power_kw: connector.power_kw, price_per_kwh: connector.price_per_kwh, station_name: station?.name, station_address: station?.address });
    }
    return res.json({ reservations });
  } catch (err) {
    console.error('Error fetching reservations:', err);
    return res.status(500).json({ error: 'Failed to fetch reservations' });
  }
};

export const cancelReservation = async (req, res) => {
  try {
    const reservation = await db.get('reservations', req.params.id);
    if (!reservation || Number(reservation.user_id) !== Number(req.user.id)) return res.status(404).json({ error: 'Reservation not found' });
    await db.update('reservations', reservation.id, { status: 'Cancelled' });
    const connector = await db.get('connectors', reservation.connector_id);
    if (connector?.status === 'Reserved') await db.update('connectors', connector.id, { status: 'Available' });
    return res.json({ message: 'Reservation cancelled successfully' });
  } catch (err) {
    console.error('Cancel reservation error:', err);
    return res.status(500).json({ error: 'Failed to cancel reservation' });
  }
};

export const deleteReservationHistory = async (req, res) => {
  try {
    const reservation = await db.get('reservations', req.params.id);
    if (!reservation || Number(reservation.user_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const endTime = new Date(reservation.end_time).getTime();
    const stillUpcoming = reservation.status === 'Active' && Number.isFinite(endTime) && endTime > Date.now();
    if (stillUpcoming) {
      return res.status(409).json({ error: 'Cancel this active reservation before deleting it from history' });
    }

    await db.delete('reservations', reservation.id);
    return res.json({ message: 'Reservation removed from booking history' });
  } catch (err) {
    console.error('Delete reservation history error:', err);
    return res.status(500).json({ error: 'Failed to delete reservation history' });
  }
};
