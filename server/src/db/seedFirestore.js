import db from './firestore.js';

const stations = [
  { name: 'ChargerHub Dynamic Grandeur Station', address: 'Dynamic Grandeur, Wadachi Wadi Road, Undri, Pune', lat: 18.4552, lng: 73.9189, rating: 4.3, reviews: 673, connectors: [['SmartPlug 746 Dynamic Grandeur', 'Connector 1', 'Wall Socket', 3.3, 'AC', 15, 'Available'], ['SmartPlug 747 Dynamic Grandeur', 'Connector 1', 'Wall Socket', 3.3, 'AC', 15, 'Available'], ['Grandeur Fast Charge DC-30', 'CCS2 Gun 1', 'CCS2', 30, 'DC', 21, 'Available']] },
  { name: 'ChargerHub Seasons Mall Hub', address: 'Magarpatta City, Hadapsar, Pune', lat: 18.5196, lng: 73.9312, rating: 4.6, reviews: 412, connectors: [['Seasons AC Fast 7.4', 'Connector 1', 'Type 2', 7.4, 'AC', 16, 'Available'], ['Seasons Dual CCS2 60kW', 'Gun A', 'CCS2', 60, 'DC', 22, 'Busy']] },
  { name: 'ChargerHub Phoenix Marketcity Hub', address: 'S No. 207, Viman Nagar Road, Pune', lat: 18.5621, lng: 73.9168, rating: 4.5, reviews: 890, connectors: [['Phoenix Ultra-Fast 60kW', 'Gun 1', 'CCS2', 60, 'DC', 22, 'Available'], ['Phoenix Commercial AC 22', 'Type 2 Gun', 'Type 2', 22, 'AC', 18, 'Available']] },
  { name: 'ChargerHub Pavillion Mall Hub', address: 'Senapati Bapat Road, Shivajinagar, Pune', lat: 18.5326, lng: 73.8322, rating: 4.7, reviews: 520, connectors: [['Pavillion Smart Fast DC', 'Connector 1', 'CCS2', 50, 'DC', 21, 'Available'], ['Pavillion AC Slow 3.3', 'Wall 16A', 'Wall Socket', 3.3, 'AC', 14, 'Available']] },
  { name: 'ChargerHub Hinjewadi Phase 1 Hub', address: 'Near Cognizant, Hinjewadi Rajiv Gandhi Infotech Park, Pune', lat: 18.5913, lng: 73.7389, rating: 4.4, reviews: 340, connectors: [['TechPark AC 11kW', 'Type 2 Gun', 'Type 2', 11, 'AC', 16, 'Available'], ['TechPark DC 50kW', 'CCS2 Gun', 'CCS2', 50, 'DC', 22, 'Offline']] },
  { name: 'ChargerHub Baner High Street Hub', address: 'Balewadi High Street, Baner, Pune', lat: 18.559, lng: 73.7868, rating: 4.8, reviews: 750, connectors: [['HighStreet DC 60kW', 'Gun 1', 'CCS2', 60, 'DC', 22, 'Available'], ['HighStreet AC 7.4kW', 'Connector 1', 'Type 2', 7.4, 'AC', 15, 'Available']] },
  { name: 'ChargerHub Amanora Town Centre', address: 'Amanora Park Town, Hadapsar, Pune', lat: 18.5178, lng: 73.936, rating: 4.4, reviews: 290, connectors: [['Amanora Fast Charger 50kW', 'CCS2', 'CCS2', 50, 'DC', 21, 'Available']] },
  { name: 'ChargerHub Kothrud Metro Hub', address: 'Ideal Colony Metro Station, Paud Road, Kothrud, Pune', lat: 18.5074, lng: 73.8077, rating: 4.6, reviews: 460, connectors: [['Metro AC 7.4kW', 'Type 2', 'Type 2', 7.4, 'AC', 15, 'Available'], ['Metro Wall Socket 3.3kW', 'Wall 16A', 'Wall Socket', 3.3, 'AC', 14, 'Available']] },
];

const products = [
  ['Nectar - 7.4kW', 'Home Chargers', 'Smart residential wall-mounted AC EV Charger with app scheduling & RFID lock.', '7.4kW', 'Type 2', 'Night BLACK', 35999, 50000, 'https://images.unsplash.com/photo-1558441719-8b449c6ff673?w=600&auto=format&fit=crop&q=80'],
  ['Nectar - 11kW', 'Home Chargers', 'High-performance 3-Phase AC Charger designed for fast residential & office EV top-ups.', '11kW', 'Type 2', 'Night BLACK', 40999, 65000, 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&auto=format&fit=crop&q=80'],
  ['Nectar - 22kW Commercial', 'Home Chargers', 'Heavy duty dual-output commercial wallbox with OCPP 1.6J and MID meter.', '22kW', 'Type 2', 'Night BLACK', 58999, 75000, 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=600&auto=format&fit=crop&q=80'],
  ['ChargerHub RFID Smart Keycard', 'RFID', 'Tap-and-charge contactless RFID card compatible with public chargers.', 'NFC', 'RFID', 'Matte Black', 499, 999, 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=600&auto=format&fit=crop&q=80'],
  ['Heavy Duty 3.3kW Portable Cable', 'Portable Chargers', 'Rugged IP66 waterproof portable 16A charging cord with Indian 3-pin plug.', '3.3kW', 'Wall Socket', 'Titanium Grey', 14999, 18500, 'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=600&auto=format&fit=crop&q=80'],
  ['Type 2 to Type 2 32A 5M Cable', 'Accessories', 'TÜV certified spiral 5-meter EV charging extension cable with carry bag.', '22kW', 'Type 2', 'Neon Green Accents', 8499, 12000, 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&auto=format&fit=crop&q=80'],
];

async function ensureStationData() {
  const stationRows = await db.list('stations');
  const stationsByName = new Map(stationRows.map((station) => [station.name, station]));
  const deletedDemoNames = new Set((await db.collection('_meta').doc('deleted_demo_station_names').get()).data()?.names || []);

  for (const stationSeed of stations) {
    if (deletedDemoNames.has(String(stationSeed.name).trim().toLowerCase())) continue;
    let station = stationsByName.get(stationSeed.name);
    if (!station) {
      station = await db.create('stations', {
        name: stationSeed.name,
        address: stationSeed.address,
        city: 'Pune',
        latitude: stationSeed.lat,
        longitude: stationSeed.lng,
        rating: stationSeed.rating,
        total_reviews: stationSeed.reviews,
        is_open_24h: true,
        is_public: true,
        amenities: ['Restroom', 'Cafe', 'WiFi', 'Parking'],
        logo_letter: 'C',
        status: 'Active',
        is_active: true,
        is_demo: true,
      });
      stationsByName.set(station.name, station);
    }

    const existingConnectors = await db.where('connectors', 'station_id', Number(station.id));
    const existingChargerNames = new Set(existingConnectors.map((connector) => connector.charger_name));
    for (const [charger_name, connector_name, connector_type, power_kw, current_type, price_per_kwh, status] of stationSeed.connectors) {
      if (existingChargerNames.has(charger_name)) continue;
      await db.create('connectors', {
        station_id: Number(station.id),
        charger_name,
        connector_name,
        connector_type,
        power_kw,
        current_type,
        price_per_kwh,
        status,
        last_used_minutes_ago: 15,
      });
    }
  }
}

export async function runFirestoreSeeds() {
  await db.init();
  const existingUsers = await db.list('users');
  const stationSeedMarker = db.collection('_meta').doc('demo_station_seeds');
  const stationSeedState = await stationSeedMarker.get();
  if (existingUsers.length) {
    if (!stationSeedState.exists) {
      await ensureStationData();
      await stationSeedMarker.set({ initialized_at: new Date().toISOString() });
      console.log('Initial demo station data was reconciled. Future station removals will stay removed.');
    }
    console.log(`Firestore already contains ${existingUsers.length} user(s); demo station seeding is complete.`);
    return;
  }
  console.log('Seeding Firebase Firestore demo data...');
  const now = Date.now();
  for (const stationSeed of stations) {
    const station = await db.create('stations', { name: stationSeed.name, address: stationSeed.address, city: 'Pune', latitude: stationSeed.lat, longitude: stationSeed.lng, rating: stationSeed.rating, total_reviews: stationSeed.reviews, is_open_24h: true, is_public: true, amenities: ['Restroom', 'Cafe', 'WiFi', 'Parking'], logo_letter: 'C', status: 'Active', is_active: true, is_demo: true });
    for (const [charger_name, connector_name, connector_type, power_kw, current_type, price_per_kwh, status] of stationSeed.connectors) {
      await db.create('connectors', { station_id: station.id, charger_name, connector_name, connector_type, power_kw, current_type, price_per_kwh, status, last_used_minutes_ago: 15 });
    }
  }
  for (const [name, category, description, power_spec, connector_type, color, price, original_price, image_url] of products) await db.create('products', { name, category, description, power_spec, connector_type, color, price, original_price, image_url, in_stock: true });
  for (const [author_name, author_badge, title, content, image_url, category, likes_count, ageDays] of [
    ['ChargerHub Official', 'Verified Partner', 'Monsoon Charge Fest ⚡', 'Claim cashback in ChargerHub Coins on wallet recharges. Offer valid for a limited time.', 'https://images.unsplash.com/photo-1558441719-8b449c6ff673?w=800&auto=format&fit=crop&q=80', 'Offers', 284, 1],
    ['Rohan Deshmukh', 'EV Explorer', 'Pune to Lonavala Weekend Trip ⛰️', 'Cruised up the ghats with our Nexon EV and made a quick coffee stop at a fast charger.', 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80', 'Trips', 142, 2],
    ['Priya Sharma', 'Green Warrior', 'Home Charger Installation Review', 'Installed a home charger in Pune. Smooth installation and a full battery every morning.', 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&auto=format&fit=crop&q=80', '#ChargerHub', 96, 3],
  ]) await db.create('buzz_posts', { author_name, author_badge, title, content, image_url, category, likes_count, created_at: new Date(now - ageDays * 86400000).toISOString() });
  await stationSeedMarker.set({ initialized_at: new Date().toISOString() });
  console.log('Public station and shop demo data seeded. Users are created through Firebase Authentication.');
}

if (process.argv[1]?.endsWith('seedFirestore.js')) {
  runFirestoreSeeds().then(() => process.exit(0)).catch((err) => {
    console.error('Firestore seed failed:', err);
    process.exit(1);
  });
}
