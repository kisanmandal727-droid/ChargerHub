import db from '../db/firestore.js';

const ACTIVE = new Set(['initiating', 'charging', 'paused']);
const CHARGING_EFFICIENCY = 0.90;
const CHARGING_TAX_MULTIPLIER = 1.18;

function calculateChargeEstimate({ chargeType, targetValue, batteryCapacity, currentSoc, powerKw, pricePerKwh }) {
  const value = Number(targetValue);
  if (!Number.isFinite(value) || value <= 0) return { error: 'Enter a charging target greater than zero' };

  const availableEnergy = Math.max(0, (100 - currentSoc) / 100 * batteryCapacity);
  let energyKwh;
  switch (String(chargeType).toLowerCase()) {
    case 'percentage':
      energyKwh = Math.min(availableEnergy, Math.max(0, Math.min(100, value) - currentSoc) / 100 * batteryCapacity);
      break;
    case 'units':
      energyKwh = Math.min(availableEnergy, Math.max(0.1, value));
      break;
    case 'amount':
      energyKwh = Math.min(availableEnergy, value / (pricePerKwh * CHARGING_TAX_MULTIPLIER));
      break;
    case 'time':
      energyKwh = Math.min(availableEnergy, Math.max(1, Math.round(value)) / 60 * powerKw * CHARGING_EFFICIENCY);
      break;
    default:
      return { error: 'Invalid charge_type. Must be Percentage, Units, Amount, or Time' };
  }

  energyKwh = Number(energyKwh.toFixed(3));
  if (energyKwh <= 0) {
    return {
      error: String(chargeType).toLowerCase() === 'percentage'
        ? 'The battery is already at or above that percentage target'
        : 'The vehicle battery is already full',
    };
  }

  const targetSoc = Math.min(100, currentSoc + energyKwh / batteryCapacity * 100);
  return {
    energyKwh,
    costInr: Number((energyKwh * pricePerKwh * CHARGING_TAX_MULTIPLIER).toFixed(2)),
    timeMinutes: Math.max(1, Math.round(energyKwh / (powerKw * CHARGING_EFFICIENCY) * 60)),
    targetSoc: Number(targetSoc.toFixed(1)),
  };
}

export const calculateCharging = async (req, res) => {
  try {
    const { charge_type, target_value, connector_id, vehicle_id } = req.body;
    if (!charge_type || target_value === undefined || !connector_id) return res.status(400).json({ error: 'charge_type, target_value, and connector_id are required' });
    const connector = await db.get('connectors', connector_id);
    if (!connector) return res.status(404).json({ error: 'Connector not found' });
    const powerKw = Number(connector.power_kw) || 3.3;
    const pricePerKwh = Number(connector.price_per_kwh) || 15;
    let batteryCapacity = 30;
    let currentSoc = 35;
    const vehicle = vehicle_id
      ? await db.get('vehicles', vehicle_id)
      : (await db.where('vehicles', 'user_id', Number(req.user.id))).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
    if (vehicle_id && (!vehicle || Number(vehicle.user_id) !== Number(req.user.id))) return res.status(404).json({ error: 'Vehicle not found' });
    if (vehicle && Number(vehicle.user_id) === Number(req.user.id)) {
      batteryCapacity = Number(vehicle.battery_capacity_kwh) || 30;
      currentSoc = Math.min(100, Math.max(0, Number(vehicle.current_battery_pct ?? 35)));
    }
    const estimate = calculateChargeEstimate({ chargeType: charge_type, targetValue: target_value, batteryCapacity, currentSoc, powerKw, pricePerKwh });
    if (estimate.error) return res.status(400).json({ error: estimate.error });
    return res.json({ charge_type, target_value: Number(target_value), units_kwh: Number(estimate.energyKwh.toFixed(2)), time_minutes: estimate.timeMinutes, cost_inr: estimate.costInr, current_soc: currentSoc, target_soc: estimate.targetSoc, connector: { id: connector.id, charger_name: connector.charger_name, power_kw: powerKw, price_per_kwh: pricePerKwh } });
  } catch (err) {
    console.error('Calculate error:', err);
    return res.status(500).json({ error: 'Failed to calculate charging parameters' });
  }
};

export const startCharging = async (req, res) => {
  let session;
  try {
    const userId = req.user.id;
    const { connector_id, vehicle_id, charge_type, target_value } = req.body;
    if (!connector_id || !charge_type || target_value === undefined) return res.status(400).json({ error: 'connector_id, charge_type, and target_value are required' });
    const [connector, user, wallet] = await Promise.all([db.get('connectors', connector_id), db.get('users', userId), db.findOneBy('wallets', 'user_id', Number(userId))]);
    if (!connector) return res.status(404).json({ error: 'Connector not found' });
    const station = await db.get('stations', connector.station_id);
    if (!station || station.is_active === false) return res.status(404).json({ error: 'This charging station is no longer available' });
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    if (connector.status !== 'Available') return res.status(400).json({ error: `Connector is currently ${connector.status}` });
    let vehicle = vehicle_id ? await db.get('vehicles', vehicle_id) : null;
    if (vehicle && Number(vehicle.user_id) !== Number(userId)) return res.status(404).json({ error: 'Vehicle not found' });
    if (!vehicle) vehicle = (await db.where('vehicles', 'user_id', Number(userId))).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0] || null;
    const currentSoc = Math.min(100, Math.max(0, Number(vehicle?.current_battery_pct ?? 35)));
    const batteryCapacity = Number(vehicle?.battery_capacity_kwh) || 30;
    const powerKw = Number(connector.power_kw) || 3.3;
    const pricePerKwh = Number(connector.price_per_kwh) || 15;
    const requestedValue = Number(target_value);
    if (!Number.isFinite(requestedValue) || requestedValue <= 0) return res.status(400).json({ error: 'Enter a charging target greater than zero' });
    const estimate = calculateChargeEstimate({ chargeType: charge_type, targetValue: requestedValue, batteryCapacity, currentSoc, powerKw, pricePerKwh });
    if (estimate.error) return res.status(400).json({ error: estimate.error });
    const targetEnergy = estimate.energyKwh;
    const targetSoc = estimate.targetSoc;
    const currentBalance = Number(wallet?.balance || 0);
    if (currentBalance + 0.000001 < estimate.costInr) {
      return res.status(402).json({
        error: `Insufficient wallet balance. This session is estimated to cost ₹${estimate.costInr.toFixed(2)}. Please add credits before charging.`,
        currentBalance,
        requiredBalance: estimate.costInr,
      });
    }
    session = await db.create('charging_sessions', {
      user_id: Number(userId), wallet_id: wallet?.id || null, vehicle_id: vehicle?.id || null, connector_id: Number(connector_id), charge_type, target_value: Number(target_value),
      station_name: station.name || "", station_address: station.address || "", charger_name: connector.charger_name || "", connector_name: connector.connector_name || "", connector_type: connector.connector_type || "", connector_power: powerKw, price_per_kwh: pricePerKwh, vehicle_model: vehicle?.model || "", registration_no: vehicle?.registration_no || "",
      start_soc_pct: currentSoc, current_soc_pct: currentSoc, target_soc_pct: Number(targetSoc.toFixed(1)), target_energy_kwh: targetEnergy, battery_capacity_kwh: batteryCapacity, power_kw: powerKw,
      energy_delivered_kwh: 0, unit_price: pricePerKwh, estimated_cost: estimate.costInr, total_cost: 0, status: 'initiating', started_at: new Date().toISOString(),
    });
    const store = db.store();
    const connectorRef = db.collection('connectors').doc(String(connector.id));
    const userRef = db.collection('users').doc(String(user.id));
    const sessionRef = db.collection('charging_sessions').doc(String(session.id));
    const walletRef = wallet ? db.collection('wallets').doc(String(wallet.id)) : null;
    const startResult = await store.runTransaction(async (tx) => {
      const refs = [connectorRef, userRef, sessionRef];
      if (walletRef) refs.push(walletRef);
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
      const [freshConnector, freshUser, freshSession, freshWallet] = snaps;
      if (!freshConnector.exists || freshConnector.data().status !== 'Available' || !freshUser.exists || !freshSession.exists) return { started: false };
      if (freshUser.data().active_session_id) return { started: false };
      const freshBalance = freshWallet?.exists ? Number(freshWallet.data().balance || 0) : 0;
      if (freshBalance + 0.000001 < estimate.costInr) return { started: false, insufficientFunds: true, currentBalance: freshBalance };
      tx.update(connectorRef, { status: 'Busy', updated_at: new Date().toISOString() });
      tx.update(userRef, { active_session_id: session.id, updated_at: new Date().toISOString() });
      tx.update(sessionRef, { status: 'charging' });
      return { started: true };
    });
    if (!startResult.started) {
      await db.delete('charging_sessions', session.id);
      session = null;
      if (startResult.insufficientFunds) {
        return res.status(402).json({
          error: `Insufficient wallet balance. This session is estimated to cost ₹${estimate.costInr.toFixed(2)}. Please add credits before charging.`,
          currentBalance: startResult.currentBalance,
          requiredBalance: estimate.costInr,
        });
      }
      return res.status(409).json({ error: 'The charger is no longer available or you already have an active charging session' });
    }
    await db.create('notifications', { user_id: Number(userId), title: 'Charging Started ⚡', message: `Your charging session has started at ${connector.charger_name}.`, type: 'charging', is_read: false });
    session.status = 'charging';
    return res.status(201).json({ message: 'Charging session initiated', session });
  } catch (err) {
    if (session) await db.delete('charging_sessions', session.id).catch(() => {});
    console.error('Start charging error:', err);
    return res.status(500).json({ error: 'Failed to start charging session' });
  }
};

async function enrichSession(session) {
  const connector = await db.get('connectors', session.connector_id);
  const [station, vehicle] = await Promise.all([connector ? db.get('stations', connector.station_id) : null, session.vehicle_id ? db.get('vehicles', session.vehicle_id) : null]);
  return { ...session, charger_name: connector?.charger_name, connector_name: connector?.connector_name, connector_type: connector?.connector_type, connector_power: connector?.power_kw, power_kw: session.power_kw, price_per_kwh: connector?.price_per_kwh ?? session.unit_price, station_name: station?.name, station_address: station?.address, vehicle_model: vehicle?.model, registration_no: vehicle?.registration_no, battery_capacity_kwh: vehicle?.battery_capacity_kwh };
}

export const getActiveSession = async (req, res) => {
  try {
    const sessions = (await db.where('charging_sessions', 'user_id', Number(req.user.id))).filter((item) => ACTIVE.has(item.status));
    sessions.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
    if (!sessions.length) return res.json({ activeSession: null });
    let activeSession = sessions[0];
    if (!activeSession.charger_name || !activeSession.station_name) activeSession = await enrichSession(activeSession);
    activeSession.elapsed_seconds = Math.max(0, Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000));
    return res.json({ activeSession });
  } catch (err) {
    console.error('Error fetching active session:', err);
    return res.status(500).json({ error: 'Failed to fetch active session' });
  }
};

export const updateTelemetry = async (req, res) => {
  try {
    const { current_soc_pct, energy_delivered_kwh, current_power_kw, total_cost, status } = req.body;
    const changes = {};
    if (current_soc_pct !== undefined) changes.current_soc_pct = Number(current_soc_pct);
    if (energy_delivered_kwh !== undefined) changes.energy_delivered_kwh = Number(energy_delivered_kwh);
    if (current_power_kw !== undefined) changes.power_kw = Number(current_power_kw);
    if (total_cost !== undefined) changes.total_cost = Number(total_cost);
    if (status !== undefined) changes.status = status;
    const session = await db.update('charging_sessions', req.params.id, changes);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json({ message: 'Telemetry updated', session });
  } catch (err) {
    console.error('Update telemetry error:', err);
    return res.status(500).json({ error: 'Failed to update telemetry' });
  }
};

export const stopCharging = async (req, res) => {
  try {
    const session = await db.get('charging_sessions', req.params.id);
    if (!session || Number(session.user_id) !== Number(req.user.id)) return res.status(404).json({ error: 'Session not found or unauthorized' });
    if (['completed', 'stopped'].includes(session.status)) return res.status(400).json({ error: 'Session is already finished' });
    const startSoc = Number(session.start_soc_pct || 0);
    const batteryCapacity = Number(session.battery_capacity_kwh) || 30;
    const powerKw = Number(session.power_kw) || 3.3;
    const unitPrice = Number(session.unit_price) || 15;
    const targetEnergy = Number(session.target_energy_kwh) || Math.max(0, (Number(session.target_soc_pct || 100) - startSoc) / 100 * batteryCapacity);
    const startedAt = Date.parse(session.started_at || "");
    const elapsedSeconds = Number.isFinite(startedAt) ? Math.max(0, (Date.now() - startedAt) / 1000) : 0;
    const elapsedEnergy = Math.min(targetEnergy, elapsedSeconds * 10 / 3600 * powerKw * CHARGING_EFFICIENCY);
    const requestedEnergy = Number(req.body.energy_kwh ?? elapsedEnergy);
    const actualEnergy = Number(Math.min(targetEnergy, Math.max(Number(session.energy_delivered_kwh || 0), Number.isFinite(requestedEnergy) ? requestedEnergy : elapsedEnergy)).toFixed(3));
    const actualSoc = Math.min(Number(session.target_soc_pct || 100), Number((startSoc + actualEnergy / batteryCapacity * 100).toFixed(1)));
    const rawCost = actualEnergy * unitPrice * CHARGING_TAX_MULTIPLIER;
    const actualCost = Number(Math.max(1, (String(session.charge_type).toLowerCase() === "amount" ? Math.min(rawCost, Number(session.target_value || rawCost)) : rawCost)).toFixed(2));
    const connector = await db.get('connectors', session.connector_id);
    const station = connector ? await db.get('stations', connector.station_id) : null;
    const wallet = await db.findOneBy('wallets', 'user_id', Number(req.user.id));
    const userRef = db.collection('users').doc(String(req.user.id));
    const sessionRef = db.collection('charging_sessions').doc(String(session.id));
    const connectorRef = db.collection('connectors').doc(String(session.connector_id));
    const walletRef = wallet ? db.collection('wallets').doc(String(wallet.id)) : null;
    const vehicleRef = session.vehicle_id ? db.collection('vehicles').doc(String(session.vehicle_id)) : null;
    const txnRef = db.collection('transactions').doc();
    const notificationRef = db.collection('notifications').doc();
    const greenKmAdded = Number((actualEnergy * 7.2).toFixed(2));
    const store = db.store();
    const result = await store.runTransaction(async (tx) => {
      const refs = [sessionRef, userRef];
      if (connectorRef) refs.push(connectorRef);
      if (walletRef) refs.push(walletRef);
      if (vehicleRef) refs.push(vehicleRef);
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
      const sessionSnap = snaps[0];
      const userSnap = snaps[1];
      if (!sessionSnap.exists || !userSnap.exists) return { conflict: true };
      const fresh = sessionSnap.data();
      if (!ACTIVE.has(fresh.status)) return { conflict: true };
      let index = 2;
      const connectorSnap = connectorRef ? snaps[index++] : null;
      const walletSnap = walletRef ? snaps[index++] : null;
      const vehicleSnap = vehicleRef ? snaps[index] : null;
      const balance = walletSnap?.exists ? Math.max(0, Number(walletSnap.data().balance || 0) - actualCost) : 0;
      const completedSession = { ...fresh, status: 'completed', current_soc_pct: actualSoc, energy_delivered_kwh: actualEnergy, total_cost: actualCost, completed_at: new Date().toISOString() };
      tx.set(sessionRef, completedSession);
      if (connectorSnap?.exists) tx.set(connectorRef, { ...connectorSnap.data(), status: 'Available', last_used_minutes_ago: 1, updated_at: new Date().toISOString() });
      tx.set(userRef, { ...userSnap.data(), active_session_id: null, green_km_driven: Number(userSnap.data().green_km_driven || 0) + greenKmAdded, updated_at: new Date().toISOString() });
      if (walletSnap?.exists) {
        tx.set(walletRef, { ...walletSnap.data(), balance, updated_at: new Date().toISOString() });
        tx.set(txnRef, { id: txnRef.id, wallet_id: wallet.id, session_id: session.id, type: 'debit', amount: actualCost, payment_method: 'Wallet', station_name: station?.name || null, description: `Charging Session #${connector?.charger_name || session.id}`, reference_id: `TXN-${Date.now().toString().slice(-6)}`, created_at: new Date().toISOString() });
      }
      if (vehicleSnap?.exists) tx.set(vehicleRef, { ...vehicleSnap.data(), current_battery_pct: actualSoc, updated_at: new Date().toISOString() });
      tx.set(notificationRef, { id: notificationRef.id, user_id: Number(req.user.id), title: 'Charging Complete ✅', message: `Charged ${actualEnergy.toFixed(2)} kWh for ₹${actualCost.toFixed(2)}. ${greenKmAdded} green km added!`, type: 'charging', is_read: false, created_at: new Date().toISOString() });
      return { session: completedSession, balance };
    });
    if (result.conflict) return res.status(409).json({ error: 'Charging session is already finished' });
    return res.json({ message: 'Charging session completed', session: result.session, walletBalance: result.balance, greenKmAdded });
  } catch (err) {
    console.error('Stop charging error:', err);
    return res.status(500).json({ error: 'Failed to stop charging session' });
  }
};

export const getHistory = async (req, res) => {
  try {
    const sessions = await db.where('charging_sessions', 'user_id', Number(req.user.id));
    sessions.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
    const history = await Promise.all(sessions.map(enrichSession));
    return res.json({ history });
  } catch (err) {
    console.error('Error fetching history:', err);
    return res.status(500).json({ error: 'Failed to retrieve charging history' });
  }
};


