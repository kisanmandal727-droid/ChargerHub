import db from '../db/index.js';

export const calculateCharging = async (req, res) => {
  try {
    const { charge_type, target_value, connector_id, vehicle_id } = req.body;

    if (!charge_type || target_value === undefined || !connector_id) {
      return res.status(400).json({ error: 'charge_type, target_value, and connector_id are required' });
    }

    // Fetch connector
    const connRes = await db.query('SELECT * FROM connectors WHERE id = $1', [connector_id]);
    if (connRes.rows.length === 0) {
      return res.status(404).json({ error: 'Connector not found' });
    }
    const connector = connRes.rows[0];
    const powerKw = parseFloat(connector.power_kw) || 3.3;
    const pricePerKwh = parseFloat(connector.price_per_kwh) || 15.0;

    // Fetch vehicle
    let batteryCapacity = 30.0;
    let currentSoc = 30;

    if (vehicle_id) {
      const vRes = await db.query('SELECT * FROM vehicles WHERE id = $1', [vehicle_id]);
      if (vRes.rows.length > 0) {
        batteryCapacity = parseFloat(vRes.rows[0].battery_capacity_kwh) || 30.0;
        currentSoc = parseInt(vRes.rows[0].current_battery_pct, 10) || 30;
      }
    } else if (req.user) {
      const vRes = await db.query('SELECT * FROM vehicles WHERE user_id = $1 ORDER BY is_primary DESC LIMIT 1', [req.user.id]);
      if (vRes.rows.length > 0) {
        batteryCapacity = parseFloat(vRes.rows[0].battery_capacity_kwh) || 30.0;
        currentSoc = parseInt(vRes.rows[0].current_battery_pct, 10) || 30;
      }
    }

    const val = parseFloat(target_value);
    let unitsKwh = 0;
    let timeMinutes = 0;
    let costInr = 0;
    let targetSoc = currentSoc;

    const efficiency = 0.90; // 90% charging efficiency

    switch (charge_type.toLowerCase()) {
      case 'percentage': {
        // e.g. 50%
        const pctDelta = Math.min(100, Math.max(1, val));
        unitsKwh = (pctDelta / 100) * batteryCapacity;
        // Units / (power * efficiency) hours
        const hours = unitsKwh / (powerKw * efficiency);
        timeMinutes = Math.max(1, Math.round(hours * 60));
        // Add platform base service fee ₹3 - ₹5 to match screenshot
        costInr = Math.round(unitsKwh * pricePerKwh * 1.18); // inclusive of 18% GST
        targetSoc = Math.min(100, currentSoc + pctDelta);
        break;
      }
      case 'units': {
        // e.g. 5 kWh
        unitsKwh = Math.max(0.1, val);
        const hours = unitsKwh / (powerKw * efficiency);
        timeMinutes = Math.max(1, Math.round(hours * 60));
        costInr = Math.round(unitsKwh * pricePerKwh * 1.18);
        const addedPct = Math.round((unitsKwh / batteryCapacity) * 100);
        targetSoc = Math.min(100, currentSoc + addedPct);
        break;
      }
      case 'amount': {
        // e.g. ₹100
        costInr = Math.max(10, val);
        unitsKwh = parseFloat((costInr / (pricePerKwh * 1.18)).toFixed(2));
        const hours = unitsKwh / (powerKw * efficiency);
        timeMinutes = Math.max(1, Math.round(hours * 60));
        const addedPct = Math.round((unitsKwh / batteryCapacity) * 100);
        targetSoc = Math.min(100, currentSoc + addedPct);
        break;
      }
      case 'time': {
        // e.g. 30 minutes
        timeMinutes = Math.max(1, Math.round(val));
        const hours = timeMinutes / 60;
        unitsKwh = parseFloat((hours * powerKw * efficiency).toFixed(2));
        costInr = Math.round(unitsKwh * pricePerKwh * 1.18);
        const addedPct = Math.round((unitsKwh / batteryCapacity) * 100);
        targetSoc = Math.min(100, currentSoc + addedPct);
        break;
      }
      default:
        return res.status(400).json({ error: 'Invalid charge_type. Must be Percentage, Units, Amount, or Time' });
    }

    return res.json({
      charge_type,
      target_value: val,
      units_kwh: parseFloat(unitsKwh.toFixed(2)),
      time_minutes: timeMinutes,
      cost_inr: costInr,
      current_soc: currentSoc,
      target_soc: targetSoc,
      connector: {
        id: connector.id,
        charger_name: connector.charger_name,
        power_kw: powerKw,
        price_per_kwh: pricePerKwh
      }
    });
  } catch (err) {
    console.error('Calculate error:', err);
    return res.status(500).json({ error: 'Failed to calculate charging parameters' });
  }
};

export const startCharging = async (req, res) => {
  try {
    const userId = req.user.id;
    const { connector_id, vehicle_id, charge_type, target_value } = req.body;

    if (!connector_id || !charge_type || target_value === undefined) {
      return res.status(400).json({ error: 'connector_id, charge_type, and target_value are required' });
    }

    // Check if user already has an ongoing active session
    const activeRes = await db.query(
      `SELECT id FROM charging_sessions 
       WHERE user_id = $1 AND status IN ('initiating', 'charging', 'paused')`,
      [userId]
    );
    if (activeRes.rows.length > 0) {
      return res.status(400).json({
        error: 'You already have an active charging session in progress',
        activeSessionId: activeRes.rows[0].id
      });
    }

    // Check connector
    const connRes = await db.query('SELECT * FROM connectors WHERE id = $1', [connector_id]);
    if (connRes.rows.length === 0) {
      return res.status(404).json({ error: 'Connector not found' });
    }
    const connector = connRes.rows[0];

    if (connector.status !== 'Available') {
      return res.status(400).json({ error: `Connector is currently ${connector.status}` });
    }

    // Check wallet balance
    const walletRes = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
    const balance = walletRes.rows.length > 0 ? parseFloat(walletRes.rows[0].balance) : 0;

    if (balance <= 0) {
      return res.status(402).json({
        error: 'Insufficient wallet balance. Please add credits before charging.',
        currentBalance: balance
      });
    }

    // Fetch vehicle
    let currentSoc = 35;
    let targetSoc = 80;
    let vId = vehicle_id;

    if (!vId) {
      const vQuery = await db.query(
        'SELECT id, current_battery_pct FROM vehicles WHERE user_id = $1 ORDER BY is_primary DESC LIMIT 1',
        [userId]
      );
      if (vQuery.rows.length > 0) {
        vId = vQuery.rows[0].id;
        currentSoc = parseInt(vQuery.rows[0].current_battery_pct, 10);
      }
    } else {
      const vQuery = await db.query('SELECT current_battery_pct FROM vehicles WHERE id = $1', [vId]);
      if (vQuery.rows.length > 0) {
        currentSoc = parseInt(vQuery.rows[0].current_battery_pct, 10);
      }
    }

    if (charge_type.toLowerCase() === 'percentage') {
      targetSoc = Math.min(100, currentSoc + parseInt(target_value, 10));
    } else {
      targetSoc = Math.min(100, currentSoc + 40);
    }

    // Update connector to Busy
    await db.query("UPDATE connectors SET status = 'Busy' WHERE id = $1", [connector_id]);

    // Create session
    const sessionRes = await db.query(
      `INSERT INTO charging_sessions (
        user_id, vehicle_id, connector_id, charge_type, target_value,
        start_soc_pct, current_soc_pct, target_soc_pct, power_kw,
        energy_delivered_kwh, unit_price, total_cost, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0.000, $10, 0.00, 'charging')
      RETURNING *`,
      [
        userId,
        vId,
        connector_id,
        charge_type,
        target_value,
        currentSoc,
        currentSoc,
        targetSoc,
        connector.power_kw,
        connector.price_per_kwh
      ]
    );

    const session = sessionRes.rows[0];

    // Notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Charging Started ⚡', $2, 'charging')`,
      [userId, `Your charging session has started at ${connector.charger_name}.`]
    );

    return res.status(201).json({
      message: 'Charging session initiated',
      session
    });
  } catch (err) {
    console.error('Start charging error:', err);
    return res.status(500).json({ error: 'Failed to start charging session' });
  }
};

export const getActiveSession = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await db.query(
      `SELECT cs.*, 
        c.charger_name, c.connector_name, c.connector_type, c.power_kw as connector_power, c.price_per_kwh,
        s.name as station_name, s.address as station_address,
        v.model as vehicle_model, v.registration_no, v.battery_capacity_kwh
       FROM charging_sessions cs
       JOIN connectors c ON cs.connector_id = c.id
       JOIN stations s ON c.station_id = s.id
       LEFT JOIN vehicles v ON cs.vehicle_id = v.id
       WHERE cs.user_id = $1 AND cs.status IN ('initiating', 'charging', 'paused')
       ORDER BY cs.started_at DESC LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ activeSession: null });
    }

    const session = result.rows[0];

    // Calculate elapsed time
    const started = new Date(session.started_at);
    const elapsedSeconds = Math.max(0, Math.floor((new Date() - started) / 1000));

    return res.json({
      activeSession: {
        ...session,
        elapsed_seconds: elapsedSeconds
      }
    });
  } catch (err) {
    console.error('Error fetching active session:', err);
    return res.status(500).json({ error: 'Failed to fetch active session' });
  }
};

export const updateTelemetry = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      current_soc_pct,
      energy_delivered_kwh,
      current_power_kw,
      total_cost,
      status
    } = req.body;

    const result = await db.query(
      `UPDATE charging_sessions
       SET current_soc_pct = COALESCE($1, current_soc_pct),
           energy_delivered_kwh = COALESCE($2, energy_delivered_kwh),
           power_kw = COALESCE($3, power_kw),
           total_cost = COALESCE($4, total_cost),
           status = COALESCE($5, status)
       WHERE id = $6
       RETURNING *`,
      [current_soc_pct, energy_delivered_kwh, current_power_kw, total_cost, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({ message: 'Telemetry updated', session: result.rows[0] });
  } catch (err) {
    console.error('Update telemetry error:', err);
    return res.status(500).json({ error: 'Failed to update telemetry' });
  }
};

export const stopCharging = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { final_soc_pct, energy_kwh, final_cost } = req.body;

    const sessionRes = await db.query(
      `SELECT cs.*, c.charger_name, s.name as station_name
       FROM charging_sessions cs
       JOIN connectors c ON cs.connector_id = c.id
       JOIN stations s ON c.station_id = s.id
       WHERE cs.id = $1 AND cs.user_id = $2`,
      [id, userId]
    );

    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or unauthorized' });
    }

    const session = sessionRes.rows[0];

    if (session.status === 'completed' || session.status === 'stopped') {
      return res.status(400).json({ error: 'Session is already finished' });
    }

    const actualSoc = final_soc_pct !== undefined ? final_soc_pct : session.current_soc_pct;
    const actualEnergy = energy_kwh !== undefined ? parseFloat(energy_kwh) : parseFloat(session.energy_delivered_kwh);
    let actualCost = final_cost !== undefined ? parseFloat(final_cost) : parseFloat(session.total_cost);

    // Minimum charge of ₹1 if energy delivered
    if (actualCost <= 0 && actualEnergy > 0) {
      actualCost = Math.max(1, Math.round(actualEnergy * parseFloat(session.unit_price) * 1.18));
    }
    if (actualCost <= 0) {
      actualCost = 1.00; // Handshake minimal base fee
    }

    // Update Session
    const updatedSessionRes = await db.query(
      `UPDATE charging_sessions
       SET status = 'completed',
           current_soc_pct = $1,
           energy_delivered_kwh = $2,
           total_cost = $3,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [actualSoc, actualEnergy, actualCost, id]
    );

    const completedSession = updatedSessionRes.rows[0];

    // Reset connector to Available
    await db.query("UPDATE connectors SET status = 'Available', last_used_minutes_ago = 1 WHERE id = $1", [session.connector_id]);

    // Update vehicle SoC if linked
    if (session.vehicle_id) {
      await db.query('UPDATE vehicles SET current_battery_pct = $1 WHERE id = $2', [actualSoc, session.vehicle_id]);
    }

    // Deduct from Wallet
    const walletRes = await db.query('SELECT id, balance FROM wallets WHERE user_id = $1', [userId]);
    let newBalance = 0;
    if (walletRes.rows.length > 0) {
      const walletId = walletRes.rows[0].id;
      const curBalance = parseFloat(walletRes.rows[0].balance);
      newBalance = Math.max(0, parseFloat((curBalance - actualCost).toFixed(2)));

      await db.query('UPDATE wallets SET balance = $1 WHERE id = $2', [newBalance, walletId]);

      // Record transaction
      const txnRef = `TXN-${Date.now().toString().slice(-6)}`;
      await db.query(
        `INSERT INTO transactions (wallet_id, session_id, type, amount, payment_method, station_name, description, reference_id)
         VALUES ($1, $2, 'debit', $3, 'Wallet', $4, $5, $6)`,
        [
          walletId,
          id,
          actualCost,
          session.station_name,
          `Charging Session #${session.charger_name}`,
          txnRef
        ]
      );
    }

    // Add Green KM driven (approx 7 km per kWh for EVs)
    const greenKmAdded = parseFloat((actualEnergy * 7.2).toFixed(2));
    if (greenKmAdded > 0) {
      await db.query(
        'UPDATE users SET green_km_driven = green_km_driven + $1 WHERE id = $2',
        [greenKmAdded, userId]
      );
    }

    // Notification
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, 'Charging Complete ✅', $2, 'charging')`,
      [userId, `Charged ${actualEnergy.toFixed(2)} kWh for ₹${actualCost.toFixed(2)}. ${greenKmAdded} green km added!`]
    );

    return res.json({
      message: 'Charging session completed',
      session: completedSession,
      walletBalance: newBalance,
      greenKmAdded
    });
  } catch (err) {
    console.error('Stop charging error:', err);
    return res.status(500).json({ error: 'Failed to stop charging session' });
  }
};

export const getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const historyRes = await db.query(
      `SELECT cs.*, 
        c.charger_name, c.connector_type,
        s.name as station_name, s.address as station_address,
        v.model as vehicle_model, v.registration_no
       FROM charging_sessions cs
       JOIN connectors c ON cs.connector_id = c.id
       JOIN stations s ON c.station_id = s.id
       LEFT JOIN vehicles v ON cs.vehicle_id = v.id
       WHERE cs.user_id = $1
       ORDER BY cs.started_at DESC`,
      [userId]
    );

    return res.json({ history: historyRes.rows });
  } catch (err) {
    console.error('Error fetching history:', err);
    return res.status(500).json({ error: 'Failed to retrieve charging history' });
  }
};
