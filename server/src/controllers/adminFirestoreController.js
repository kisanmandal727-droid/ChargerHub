import db from '../db/firestore.js';
import { getFirebaseAdminAuth } from '../services/firebaseAdmin.js';

async function recordsOwnedBy(collectionName, field, value) {
  const values = [...new Set([Number(value), String(value)])];
  const matches = await Promise.all(values.map((candidate) => db.where(collectionName, field, candidate)));
  return [...new Map(matches.flat().map((record) => [String(record.id), record])).values()];
}

async function documentRefsOwnedBy(collectionName, field, values) {
  const snapshots = await Promise.all(values.map((value) => db.collection(collectionName).where(field, '==', value).get()));
  return [...new Map(snapshots.flatMap((snapshot) => snapshot.docs).map((doc) => [doc.id, doc.ref])).values()];
}

async function deleteDocumentRefs(refs) {
  for (let offset = 0; offset < refs.length; offset += 400) {
    const batch = db.store().batch();
    refs.slice(offset, offset + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteSupportTicket(ticket) {
  const ticketRef = db.collection('support_tickets').doc(String(ticket.id));
  while (true) {
    const messages = await ticketRef.collection('messages').limit(400).get();
    if (messages.empty) break;
    const batch = db.store().batch();
    messages.docs.forEach((message) => batch.delete(message.ref));
    await batch.commit();
  }
  await ticketRef.delete();
}

async function rememberDeletedDemoStation(station) {
  if (!station?.is_demo || !station.name) return;
  const ref = db.collection('_meta').doc('deleted_demo_station_names');
  const snapshot = await ref.get();
  const names = new Set(snapshot.data()?.names || []);
  names.add(String(station.name).trim().toLowerCase());
  await ref.set({ names: [...names], updated_at: new Date().toISOString() }, { merge: true });
}

export const getMetrics = async (req, res) => {
  try {
    const [users, vehicles, stationRows, connectorRows, sessions] = await Promise.all(['users', 'vehicles', 'stations', 'connectors', 'charging_sessions'].map((name) => db.list(name)));
    const activeStations = stationRows.filter((station) => station.is_active !== false);
    const activeStationIds = new Set(activeStations.map((station) => Number(station.id)));
    return res.json({ metrics: {
      totalUsers: users.length, totalVehicles: vehicles.length, totalStations: activeStations.length, totalConnectors: connectorRows.filter((connector) => activeStationIds.has(Number(connector.station_id))).length,
      activeSessions: sessions.filter((s) => ['initiating', 'charging', 'paused'].includes(s.status)).length,
      totalEnergyDispensedKwh: Number(sessions.reduce((sum, s) => sum + Number(s.energy_delivered_kwh || 0), 0).toFixed(2)),
      totalRevenueInr: Number(sessions.reduce((sum, s) => sum + Number(s.total_cost || 0), 0).toFixed(2)),
    } });
  } catch (err) {
    console.error('Admin metrics error:', err);
    return res.status(500).json({ error: 'Failed to retrieve admin metrics' });
  }
};

export const getAllStationsWithConnectors = async (req, res) => {
  try {
    const stations = (await db.list('stations')).sort((a, b) => a.id - b.id);
    const connectors = await db.list('connectors');
    return res.json({ stations: stations.map((station) => ({ ...station, connectors: connectors.filter((c) => Number(c.station_id) === Number(station.id)).map(({ id, charger_name, connector_name, connector_type, power_kw, current_type, price_per_kwh, status, last_used_minutes_ago }) => ({ id, charger_name, connector_name, connector_type, power_kw, current_type, price_per_kwh, status, last_used_minutes_ago })) })) });
  } catch (err) {
    console.error('Error fetching admin stations:', err);
    return res.status(500).json({ error: 'Failed to fetch stations' });
  }
};

export const createStation = async (req, res) => {
  let station;
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : '';
    const address = typeof req.body?.address === 'string' ? req.body.address.trim().slice(0, 240) : '';
    const city = typeof req.body?.city === 'string' ? req.body.city.trim().slice(0, 80) : '';
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const chargerName = typeof req.body?.charger_name === 'string' ? req.body.charger_name.trim().slice(0, 120) : '';
    const connectorName = typeof req.body?.connector_name === 'string' ? req.body.connector_name.trim().slice(0, 80) : '';
    const connectorType = typeof req.body?.connector_type === 'string' ? req.body.connector_type.trim().slice(0, 40) : '';
    const currentType = String(req.body?.current_type || '').toUpperCase();
    const powerKw = Number(req.body?.power_kw);
    const pricePerKwh = Number(req.body?.price_per_kwh);

    if (!name || !address || !city || !chargerName || !connectorName || !connectorType) {
      return res.status(400).json({ error: 'Enter the station name, address, city, and charger details.' });
    }
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Enter valid latitude and longitude coordinates.' });
    }
    if (!['AC', 'DC'].includes(currentType) || !Number.isFinite(powerKw) || powerKw <= 0 || !Number.isFinite(pricePerKwh) || pricePerKwh <= 0) {
      return res.status(400).json({ error: 'Enter a valid AC/DC type, charger power, and price per kWh.' });
    }
    const duplicate = await db.findOne('stations', (item) => String(item.name).toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(409).json({ error: 'A station with this name already exists. Edit it or delete it from the station list first.' });

    station = await db.create('stations', {
      name,
      address,
      city,
      latitude,
      longitude,
      rating: 0,
      total_reviews: 0,
      is_open_24h: true,
      is_public: true,
      amenities: [],
      logo_letter: name.charAt(0).toUpperCase(),
      status: 'Active',
      is_active: true,
      is_demo: false,
      created_by: req.user.id
    });

    let connector;
    try {
      connector = await db.create('connectors', {
        station_id: Number(station.id),
        charger_name: chargerName,
        connector_name: connectorName,
        connector_type: connectorType,
        power_kw: powerKw,
        current_type: currentType,
        price_per_kwh: pricePerKwh,
        status: 'Available',
        last_used_minutes_ago: 0
      });
    } catch (err) {
      await db.delete('stations', station.id);
      throw err;
    }

    return res.status(201).json({ station: { ...station, connectors: [connector] } });
  } catch (err) {
    console.error('Create station error:', err);
    return res.status(500).json({ error: 'Could not add the charging station.' });
  }
};

export const updateStation = async (req, res) => {
  try {
    const station = await db.get('stations', req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found.' });

    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : '';
    const address = typeof req.body?.address === 'string' ? req.body.address.trim().slice(0, 240) : '';
    const city = typeof req.body?.city === 'string' ? req.body.city.trim().slice(0, 80) : '';
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    if (!name || !address || !city) return res.status(400).json({ error: 'Enter the station name, address, and city.' });
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Enter valid latitude and longitude coordinates.' });
    }

    const duplicate = await db.findOne('stations', (item) => Number(item.id) !== Number(station.id) && String(item.name).toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(409).json({ error: 'Another station already uses this name.' });

    if (station.is_demo && String(station.name).trim().toLowerCase() !== name.toLowerCase()) await rememberDeletedDemoStation(station);
    const updated = await db.update('stations', station.id, { name, address, city, latitude, longitude, logo_letter: name.charAt(0).toUpperCase() });
    const connectors = await db.where('connectors', 'station_id', Number(station.id));
    return res.json({ station: { ...updated, connectors }, message: 'Station details updated.' });
  } catch (err) {
    console.error('Update station error:', err);
    return res.status(500).json({ error: 'Could not update the charging station.' });
  }
};

export const removeStation = async (req, res) => {
  try {
    const station = await db.get('stations', req.params.id);
    if (!station) return res.status(404).json({ error: 'Station not found.' });

    const connectors = await db.where('connectors', 'station_id', Number(station.id));
    const connectorIds = new Set(connectors.map((connector) => Number(connector.id)));
    const [sessions, reservations, savedStations, savedTrips, transactions, notifications, stationReviews] = await Promise.all([
      db.list('charging_sessions'), db.list('reservations'), db.list('saved_stations'), db.list('saved_trips'), db.list('transactions'), db.list('notifications'),
      db.where('station_reviews', 'station_id', Number(station.id))
    ]);
    const activeSession = sessions.find((session) => connectorIds.has(Number(session.connector_id)) && ['initiating', 'charging', 'paused'].includes(String(session.status).toLowerCase()));
    if (activeSession) return res.status(409).json({ error: 'This station has an active charging session. Stop the session before deleting it.' });

    // Hide it first, then clean up references. If cleanup is interrupted, a retry can finish
    // deleting it without the station remaining visible to app users.
    await db.update('stations', station.id, { is_active: false, status: 'Deleting' });
    const relatedSessionIds = new Set(sessions.filter((session) => connectorIds.has(Number(session.connector_id))).map((session) => String(session.id)));
    const chargerNames = connectors.map((connector) => String(connector.charger_name || '').trim()).filter(Boolean);
    const stationName = String(station.name || '').trim();
    await rememberDeletedDemoStation(station);
    const scrubText = (value) => {
      let result = String(value || '');
      for (const label of [stationName, ...chargerNames].sort((a, b) => b.length - a.length)) {
        if (label) result = result.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), 'a charging station');
      }
      return result.replace(/\s{2,}/g, ' ').trim();
    };

    const operations = [];
    for (const item of savedStations.filter((row) => Number(row.station_id) === Number(station.id))) {
      operations.push({ type: 'delete', collection: 'saved_stations', id: item.id });
    }
    for (const review of stationReviews) {
      operations.push({ type: 'delete', collection: 'station_reviews', id: review.id });
    }
    for (const item of reservations.filter((row) => connectorIds.has(Number(row.connector_id)))) {
      operations.push({ type: 'delete', collection: 'reservations', id: item.id });
    }
    for (const connector of connectors) operations.push({ type: 'delete', collection: 'connectors', id: connector.id });
    for (const trip of savedTrips) {
      const suggested = Array.isArray(trip.suggested_stations) ? trip.suggested_stations : [];
      const remaining = suggested.filter((item) => String(item?.id) !== String(station.id));
      if (remaining.length !== suggested.length) operations.push({ type: 'update', collection: 'saved_trips', id: trip.id, changes: { suggested_stations: remaining } });
    }
    for (const session of sessions.filter((row) => connectorIds.has(Number(row.connector_id)))) {
      operations.push({ type: 'update', collection: 'charging_sessions', id: session.id, changes: { station_name: null, station_address: null, charger_name: null, connector_name: null } });
    }
    for (const transaction of transactions) {
      const linkedBySession = relatedSessionIds.has(String(transaction.session_id));
      const linkedByName = String(transaction.station_name || '').trim().toLowerCase() === stationName.toLowerCase();
      const linkedByConnector = chargerNames.some((name) => String(transaction.description || '').toLowerCase().includes(name.toLowerCase()));
      if (linkedBySession || linkedByName || linkedByConnector) {
        operations.push({ type: 'update', collection: 'transactions', id: transaction.id, changes: { station_name: null, station_address: null, station_id: null, connector_id: null, description: 'Charging session' } });
      }
    }
    for (const notification of notifications) {
      const message = scrubText(notification.message);
      const title = scrubText(notification.title);
      if (message !== String(notification.message || '') || title !== String(notification.title || '')) {
        operations.push({ type: 'update', collection: 'notifications', id: notification.id, changes: { message: message || 'A charging station was removed.', title } });
      }
    }

    operations.sort((a, b) => Number(a.type === 'delete') - Number(b.type === 'delete'));
    for (let offset = 0; offset < operations.length; offset += 400) {
      const batch = db.store().batch();
      for (const operation of operations.slice(offset, offset + 400)) {
        const ref = db.collection(operation.collection).doc(String(operation.id));
        if (operation.type === 'delete') batch.delete(ref);
        else batch.update(ref, { ...operation.changes, updated_at: new Date().toISOString() });
      }
      await batch.commit();
    }

    await db.delete('stations', station.id);
    return res.json({ stationId: station.id, message: 'Station permanently deleted from the map and user pages. Charging and payment totals were kept.' });
  } catch (err) {
    console.error('Delete station error:', err);
    return res.status(500).json({ error: 'Could not completely delete the charging station. It is hidden from users; try deleting it again from the admin panel.' });
  }
};

export const updateConnectorStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Available', 'Busy', 'Offline', 'Reserved', 'Faulted'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    const connector = await db.update('connectors', req.params.id, { status });
    if (!connector) return res.status(404).json({ error: 'Connector not found' });
    return res.json({ message: `Connector status updated to ${status}`, connector });
  } catch (err) {
    console.error('Update connector error:', err);
    return res.status(500).json({ error: 'Failed to update connector status' });
  }
};

export const getAllSessions = async (req, res) => {
  try {
    const rows = await db.list('charging_sessions');
    rows.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
    const sessions = [];
    for (const session of rows.slice(0, 50)) {
      const [user, connector] = await Promise.all([db.get('users', session.user_id), db.get('connectors', session.connector_id)]);
      const station = connector ? await db.get('stations', connector.station_id) : null;
      sessions.push({ ...session, user_name: user?.name, user_email: user?.email, user_phone: user?.phone, charger_name: connector?.charger_name, connector_type: connector?.connector_type, station_name: station?.name });
    }
    return res.json({ sessions });
  } catch (err) {
    console.error('Error fetching admin sessions:', err);
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const [users, wallets, vehicles] = await Promise.all(['users', 'wallets', 'vehicles'].map((name) => db.list(name)));
    users.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return res.json({ users: users.map(({ password_hash, ...user }) => {
      const wallet = wallets.find((item) => Number(item.user_id) === Number(user.id));
      return { ...user, wallet_balance: wallet?.balance || 0, wallet_coins: wallet?.coins || 0, vehicle_count: vehicles.filter((item) => Number(item.user_id) === Number(user.id)).length };
    }) });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user ID.' });

    const user = await db.get('users', userId);
    if (!user) return res.status(404).json({ error: 'This registered user was already removed.' });

    // Remove the Firebase login first. If it was already deleted in Firebase Console,
    // continue with the orphaned ChargerHub profile and its data.
    if (user.firebase_uid) {
      try {
        const auth = getFirebaseAdminAuth();
        const authUser = await auth.getUser(user.firebase_uid);
        if (String(authUser.email || '').trim().toLowerCase() !== String(user.email || '').trim().toLowerCase()) {
          return res.status(409).json({ error: 'The Firebase account does not match this ChargerHub profile. No data was deleted.' });
        }
        await auth.deleteUser(user.firebase_uid);
      } catch (err) {
        if (err.code !== 'auth/user-not-found') throw err;
      }
    }

    const userIdValues = [...new Set([userId, String(userId)])];
    const ownedCollections = [
      'vehicles', 'wallets', 'notifications', 'charging_sessions', 'reservations',
      'saved_stations', 'saved_trips', 'orders', 'wallet_payment_orders',
      'support_tickets', 'station_reviews'
    ];
    const ownedResults = await Promise.all(ownedCollections.map(async (collectionName) => {
      const rows = await Promise.all(userIdValues.map((value) => db.where(collectionName, 'user_id', value)));
      return [collectionName, [...new Map(rows.flat().map((record) => [String(record.id), record])).values()]];
    }));
    const owned = Object.fromEntries(ownedResults);
    const walletIds = owned.wallets.map((wallet) => wallet.id);
    const transactions = (await Promise.all(walletIds.map((walletId) => recordsOwnedBy('transactions', 'wallet_id', walletId)))).flat();
    const razorpayPaymentRefs = await documentRefsOwnedBy('razorpay_payments', 'user_id', userIdValues);
    const reviewedStationIds = [...new Set(owned.station_reviews.map((review) => Number(review.station_id)).filter(Number.isSafeInteger))];

    // If an account is removed during a demo charging session, release the connector
    // before deleting that session so the station is not left looking permanently busy.
    const activeSessions = owned.charging_sessions.filter((session) => ['initiating', 'charging', 'paused'].includes(String(session.status).toLowerCase()));
    const activeConnectorIds = [...new Set(activeSessions.map((session) => Number(session.connector_id)).filter(Number.isSafeInteger))];
    for (const connectorId of activeConnectorIds) {
      const connector = await db.get('connectors', connectorId);
      if (connector) await db.update('connectors', connectorId, { status: 'Available' });
    }

    const deletedRefs = [
      ...ownedCollections.filter((collectionName) => collectionName !== 'support_tickets').flatMap((collectionName) => owned[collectionName].map((record) => db.collection(collectionName).doc(String(record.id)))),
      ...transactions.map((record) => db.collection('transactions').doc(String(record.id))),
      ...razorpayPaymentRefs,
      db.collection('users').doc(String(userId)),
    ];

    // Nested Firestore collections must be removed explicitly before their parent ticket.
    for (const ticket of owned.support_tickets) await deleteSupportTicket(ticket);
    await deleteDocumentRefs(deletedRefs);
    for (const stationId of reviewedStationIds) {
      const [station, remainingReviews] = await Promise.all([
        db.get('stations', stationId),
        db.where('station_reviews', 'station_id', stationId),
      ]);
      if (!station) continue;
      const ratingSum = remainingReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
      const reviewCount = remainingReviews.length;
      const rating = reviewCount ? Number((ratingSum / reviewCount).toFixed(1)) : 0;
      await db.update('stations', stationId, {
        community_rating_sum: ratingSum,
        community_review_count: reviewCount,
        community_rating: rating,
        rating,
        total_reviews: reviewCount,
      });
    }
    if (user.firebase_uid) await db.collection('admin_users').doc(user.firebase_uid).delete();

    return res.json({
      message: `Deleted ${user.email || user.name || 'the user'} and their ChargerHub account data.`,
      removed: Object.fromEntries(ownedCollections.map((name) => [name, owned[name].length]).concat([['transactions', transactions.length], ['razorpay_payments', razorpayPaymentRefs.length], ['profile', 1]])),
    });
  } catch (err) {
    console.error('Delete registered user error:', err);
    return res.status(500).json({ error: 'Could not completely delete this user. Refresh the user list and retry if the account is still shown.' });
  }
};
