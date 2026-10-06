import db from '../db/index.js';

export const createReservation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { connector_id, start_time, duration_minutes = 30 } = req.body;

    if (!connector_id || !start_time) {
      return res.status(400).json({ error: 'connector_id and start_time are required' });
    }

    const start = new Date(start_time);
    const end = new Date(start.getTime() + duration_minutes * 60000);

    // Connector existence
    const connRes = await db.query('SELECT * FROM connectors WHERE id = $1', [connector_id]);
    if (connRes.rows.length === 0) {
      return res.status(404).json({ error: 'Connector not found' });
    }
    const connector = connRes.rows[0];

    if (connector.status === 'Offline' || connector.status === 'Faulted') {
      return res.status(400).json({ error: `Cannot reserve connector in ${connector.status} status` });
    }

    // PREVENT DOUBLE BOOKING: Check for overlapping active reservations
    const conflictRes = await db.query(
      `SELECT id FROM reservations 
       WHERE connector_id = $1 
         AND status = 'Active' 
         AND (
           (start_time <= $2 AND end_time > $2) OR
           (start_time < $3 AND end_time >= $3) OR
           (start_time >= $2 AND end_time <= $3)
         )`,
      [connector_id, start.toISOString(), end.toISOString()]
    );

    if (conflictRes.rows.length > 0) {
      return res.status(409).json({
        error: 'This connector is already reserved for the selected time slot. Please pick another time or connector.'
      });
    }

    const resInsert = await db.query(
      `INSERT INTO reservations (user_id, connector_id, start_time, end_time, duration_minutes, status)
       VALUES ($1, $2, $3, $4, $5, 'Active')
       RETURNING *`,
      [userId, connector_id, start.toISOString(), end.toISOString(), duration_minutes]
    );

    // If reservation starts right now, update connector status
    const now = new Date();
    if (start <= now && end > now) {
      await db.query("UPDATE connectors SET status = 'Reserved' WHERE id = $1", [connector_id]);
    }

    // Notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Connector Reserved 📅', $2, 'charging')`,
      [userId, `Slot reserved at ${connector.charger_name} from ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`]
    );

    return res.status(201).json({
      message: 'Reservation confirmed',
      reservation: resInsert.rows[0]
    });
  } catch (err) {
    console.error('Reservation error:', err);
    return res.status(500).json({ error: 'Failed to create reservation' });
  }
};

export const getMyReservations = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT r.*, 
        c.charger_name, c.connector_name, c.connector_type, c.power_kw, c.price_per_kwh,
        s.name as station_name, s.address as station_address
       FROM reservations r
       JOIN connectors c ON r.connector_id = c.id
       JOIN stations s ON c.station_id = s.id
       WHERE r.user_id = $1
       ORDER BY r.start_time DESC`,
      [userId]
    );

    return res.json({ reservations: result.rows });
  } catch (err) {
    console.error('Error fetching reservations:', err);
    return res.status(500).json({ error: 'Failed to fetch reservations' });
  }
};

export const cancelReservation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const resCheck = await db.query(
      'SELECT * FROM reservations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (resCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = resCheck.rows[0];

    await db.query("UPDATE reservations SET status = 'Cancelled' WHERE id = $1", [id]);

    // Reset connector if currently reserved
    const connCheck = await db.query('SELECT status FROM connectors WHERE id = $1', [reservation.connector_id]);
    if (connCheck.rows.length > 0 && connCheck.rows[0].status === 'Reserved') {
      await db.query("UPDATE connectors SET status = 'Available' WHERE id = $1", [reservation.connector_id]);
    }

    return res.json({ message: 'Reservation cancelled successfully' });
  } catch (err) {
    console.error('Cancel reservation error:', err);
    return res.status(500).json({ error: 'Failed to cancel reservation' });
  }
};
