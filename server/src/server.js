import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import apiRouter from './routes/api.js';
import db from './db/firestore.js';
import { runFirestoreSeeds } from './db/seedFirestore.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-simulator-key']
}));
app.use(express.json({ limit: '900kb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'EV Charging Platform API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount API Routes
app.use('/api', apiRouter);

// WebSocket Server for Real-Time Telemetry & Charger Status
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to EV Telemetry Hub' }));

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // Handle client or simulator ping/events
      if (msg.type === 'SUBSCRIBE_SESSION') {
        ws.subscribedSessionId = msg.sessionId;
      }
    } catch (e) {
      // ignore
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

export function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Background charging simulation. A 30-second database tick stays within the
// Firestore free-tier budget for the demo while telemetry is interpolated in the UI.
const CHARGING_TICK_INTERVAL_MS = Math.max(10000, Number(process.env.FIRESTORE_CHARGING_TICK_INTERVAL_MS) || 30000);
const SIMULATION_TIME_MULTIPLIER = 10;
let chargingTickRunning = false;
let chargingTickPausedForQuota = false;

setInterval(async () => {
  if (chargingTickRunning || chargingTickPausedForQuota) return;
  chargingTickRunning = true;
  try {
    const activeSessions = await db.collection('charging_sessions').where('status', '==', 'charging').get();
    for (const sessionDoc of activeSessions.docs) {
      const session = sessionDoc.data();
      const sessionRef = db.collection('charging_sessions').doc(sessionDoc.id);
      const connectorRef = session.connector_id ? db.collection('connectors').doc(String(session.connector_id)) : null;
      const userRef = db.collection('users').doc(String(session.user_id));
      const vehicleRef = session.vehicle_id ? db.collection('vehicles').doc(String(session.vehicle_id)) : null;
      const capacity = Number(session.battery_capacity_kwh) || 30;
      const power = Number(session.power_kw) || 3.3;
      const price = Number(session.unit_price) || 15;
      const startSoc = Number(session.start_soc_pct || 0);
      const targetSoc = Number(session.target_soc_pct || 100);
      const targetEnergy = Number(session.target_energy_kwh) || Math.max(0, (targetSoc - startSoc) / 100 * capacity);
      const tickSeconds = CHARGING_TICK_INTERVAL_MS / 1000;
      const proposedEnergy = Math.min(
        Math.max(0, targetEnergy - Number(session.energy_delivered_kwh || 0)),
        power * (tickSeconds * SIMULATION_TIME_MULTIPLIER / 3600) * 0.90,
      ) + Number(session.energy_delivered_kwh || 0);
      const proposedSoc = Math.min(100, startSoc + proposedEnergy / capacity * 100);
      const shouldComplete = proposedEnergy >= targetEnergy - 0.0005 || proposedSoc >= targetSoc;
      let walletId = session.wallet_id || null;
      if (shouldComplete && !walletId) {
        const wallet = await db.findOneBy('wallets', 'user_id', Number(session.user_id));
        walletId = wallet?.id || null;
      }
      const walletRef = walletId ? db.collection('wallets').doc(String(walletId)) : null;
      const transactionRef = db.collection('transactions').doc();
      const notificationRef = db.collection('notifications').doc();

      const result = await db.store().runTransaction(async (tx) => {
        // Normal ticks read and write only the session document. Related records
        // are read only once, when the target is reached and settlement is due.
        const freshSessionSnap = await tx.get(sessionRef);
        if (!freshSessionSnap.exists) return null;
        const fresh = freshSessionSnap.data();
        if (fresh.status !== 'charging') return null;

        const freshCapacity = Number(fresh.battery_capacity_kwh) || capacity;
        const freshPower = Number(fresh.power_kw) || power;
        const freshPrice = Number(fresh.unit_price) || price;
        const freshStartSoc = Number(fresh.start_soc_pct || 0);
        const freshTargetSoc = Number(fresh.target_soc_pct || targetSoc);
        const freshTargetEnergy = Number(fresh.target_energy_kwh) || Math.max(0, (freshTargetSoc - freshStartSoc) / 100 * freshCapacity);
        const previousEnergy = Number(fresh.energy_delivered_kwh || 0);
        const energyIncrement = Math.min(
          Math.max(0, freshTargetEnergy - previousEnergy),
          freshPower * (tickSeconds * SIMULATION_TIME_MULTIPLIER / 3600) * 0.90,
        );
        const newEnergy = Number((previousEnergy + energyIncrement).toFixed(3));
        const newSoc = Math.min(100, Number((freshStartSoc + newEnergy / freshCapacity * 100).toFixed(1)));
        const calculatedCost = newEnergy * freshPrice * 1.18;
        const newCost = Number((String(fresh.charge_type).toLowerCase() === 'amount'
          ? Math.min(calculatedCost, Number(fresh.target_value))
          : calculatedCost).toFixed(2));
        const newStatus = newEnergy >= freshTargetEnergy - 0.0005 || newSoc >= freshTargetSoc ? 'completed' : 'charging';
        const completedAt = new Date().toISOString();

        let related = {};
        if (newStatus === 'completed') {
          const refs = [['connector', connectorRef], ['user', userRef], ['vehicle', vehicleRef], ['wallet', walletRef]].filter(([, ref]) => ref);
          const snapshots = await Promise.all(refs.map(([, ref]) => tx.get(ref)));
          related = Object.fromEntries(refs.map(([key], index) => [key, snapshots[index]]));
        }

        tx.update(sessionRef, {
          target_energy_kwh: freshTargetEnergy,
          current_soc_pct: newSoc,
          energy_delivered_kwh: newEnergy,
          total_cost: newCost,
          status: newStatus,
          ...(newStatus === 'completed' ? { completed_at: completedAt } : {}),
          updated_at: completedAt,
        });

        if (newStatus === 'completed') {
          const greenKmAdded = Number((newEnergy * 7.2).toFixed(2));
          if (related.connector?.exists) tx.update(connectorRef, { status: 'Available', updated_at: completedAt });
          if (related.user?.exists) tx.update(userRef, { active_session_id: null, green_km_driven: Number(related.user.data().green_km_driven || 0) + greenKmAdded, updated_at: completedAt });
          if (related.vehicle?.exists) tx.update(vehicleRef, { current_battery_pct: newSoc, updated_at: completedAt });
          if (related.wallet?.exists) {
            const balance = Math.max(0, Number(related.wallet.data().balance || 0) - newCost);
            tx.update(walletRef, { balance, updated_at: completedAt });
            tx.set(transactionRef, {
              id: transactionRef.id,
              wallet_id: Number(walletId),
              session_id: fresh.id,
              type: 'debit',
              amount: newCost,
              payment_method: 'Wallet',
              station_name: fresh.station_name || null,
              description: `Charging Session #${fresh.charger_name || fresh.connector_id}`,
              reference_id: `TXN-${Date.now().toString().slice(-6)}`,
              created_at: completedAt,
            });
          }
          tx.set(notificationRef, {
            id: notificationRef.id,
            user_id: Number(fresh.user_id),
            title: 'Charging Complete ✅',
            message: `Charged ${newEnergy.toFixed(2)} kWh for ₹${newCost.toFixed(2)}. ${greenKmAdded} green km added!`,
            type: 'charging',
            is_read: false,
            created_at: completedAt,
          });
        }
        return { id: fresh.id, current_soc_pct: newSoc, energy_delivered_kwh: newEnergy, total_cost: newCost, power_kw: freshPower, status: newStatus };
      });

      if (result) broadcast({ type: 'CHARGING_TELEMETRY', sessionId: result.id, current_soc_pct: result.current_soc_pct, energy_delivered_kwh: result.energy_delivered_kwh, total_cost: result.total_cost, power_kw: result.power_kw, status: result.status });
    }
  } catch (err) {
    const quotaExceeded = Number(err.code) === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(err.message || '');
    if (quotaExceeded) {
      chargingTickPausedForQuota = true;
      console.error('Firestore charging simulation paused because the project quota is exhausted.');
    } else {
      console.error('Firestore charging tick error:', err.message);
    }
  } finally {
    chargingTickRunning = false;
  }
}, CHARGING_TICK_INTERVAL_MS);

// Global Error Handler
app.use((err, req, res, next) => {
  const quotaExceeded = Number(err.code) === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(err.message || '');
  if (quotaExceeded) {
    console.error('Firestore rejected an API request because the project quota is exhausted.');
    return res.status(503).json({ error: 'ChargerHub’s Firestore quota is temporarily exhausted. Please try again later.' });
  }
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Server Initialization
async function startServer() {
  try {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
      throw new Error('Set a private JWT_SECRET before starting the production server');
    }

    server.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(`🚀 EV Charging Backend API is running!`);
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`🔌 WebSocket: ws://localhost:${PORT}/ws`);
      console.log(`=========================================`);
    });

    // Keep the API available when Firestore is temporarily over quota. Demo data
    // is only seeded on explicit request, so every normal restart avoids extra reads/writes.
    if (process.env.RUN_FIRESTORE_SEEDS === 'true') {
      runFirestoreSeeds().then(() => {
        console.log('Firestore demo seeding completed.');
      }).catch((err) => {
        console.error('Firestore demo seeding failed; the API remains available:', err.message || err);
      });
    }
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

