import db from '../db/index.js';

export const getMetrics = async (req, res) => {
  try {
    const userCount = await db.query('SELECT COUNT(*) as count FROM users');
    const vehicleCount = await db.query('SELECT COUNT(*) as count FROM vehicles');
    const stationCount = await db.query('SELECT COUNT(*) as count FROM stations');
    const connectorCount = await db.query('SELECT COUNT(*) as count FROM connectors');
    const activeSessions = await db.query("SELECT COUNT(*) as count FROM charging_sessions WHERE status IN ('initiating', 'charging', 'paused')");
    const totalEnergy = await db.query('SELECT COALESCE(SUM(energy_delivered_kwh), 0) as total FROM charging_sessions');
    const totalRevenue = await db.query('SELECT COALESCE(SUM(total_cost), 0) as total FROM charging_sessions');

    return res.json({
      metrics: {
        totalUsers: parseInt(userCount.rows[0].count, 10),
        totalVehicles: parseInt(vehicleCount.rows[0].count, 10),
        totalStations: parseInt(stationCount.rows[0].count, 10),
        totalConnectors: parseInt(connectorCount.rows[0].count, 10),
        activeSessions: parseInt(activeSessions.rows[0].count, 10),
        totalEnergyDispensedKwh: parseFloat(parseFloat(totalEnergy.rows[0].total).toFixed(2)),
        totalRevenueInr: parseFloat(parseFloat(totalRevenue.rows[0].total).toFixed(2))
      }
    });
  } catch (err) {
    console.error('Admin metrics error:', err);
    return res.status(500).json({ error: 'Failed to retrieve admin metrics' });
  }
};

export const getAllStationsWithConnectors = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, 
        json_agg(
          json_build_object(
            'id', c.id,
            'charger_name', c.charger_name,
            'connector_name', c.connector_name,
            'connector_type', c.connector_type,
            'power_kw', c.power_kw,
            'current_type', c.current_type,
            'price_per_kwh', c.price_per_kwh,
            'status', c.status,
            'last_used_minutes_ago', c.last_used_minutes_ago
          )
        ) AS connectors
       FROM stations s
       LEFT JOIN connectors c ON s.id = c.station_id
       GROUP BY s.id
       ORDER BY s.id ASC`
    );

    return res.json({ stations: result.rows });
  } catch (err) {
    console.error('Error fetching admin stations:', err);
    return res.status(500).json({ error: 'Failed to fetch stations' });
  }
};

export const updateConnectorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['Available', 'Busy', 'Offline', 'Reserved', 'Faulted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updated = await db.query(
      `UPDATE connectors 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Connector not found' });
    }

    return res.json({
      message: `Connector status updated to ${status}`,
      connector: updated.rows[0]
    });
  } catch (err) {
    console.error('Update connector error:', err);
    return res.status(500).json({ error: 'Failed to update connector status' });
  }
};

export const getAllSessions = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT cs.*, 
        u.name as user_name, u.email as user_email, u.phone as user_phone,
        c.charger_name, c.connector_type,
        s.name as station_name
       FROM charging_sessions cs
       JOIN users u ON cs.user_id = u.id
       JOIN connectors c ON cs.connector_id = c.id
       JOIN stations s ON c.station_id = s.id
       ORDER BY cs.started_at DESC LIMIT 50`
    );

    return res.json({ sessions: result.rows });
  } catch (err) {
    console.error('Error fetching admin sessions:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.green_km_driven, u.created_at,
        w.balance as wallet_balance, w.coins as wallet_coins,
        (SELECT COUNT(*) FROM vehicles v WHERE v.user_id = u.id) as vehicle_count
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       ORDER BY u.created_at DESC`
    );

    return res.json({ users: result.rows });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
};
