import db from './index.js';
import bcrypt from 'bcryptjs';

export async function runSeeds() {
  await db.init();
  console.log('🌱 Checking seed data...');

  try {
    // Check if users exist
    const userCheck = await db.query('SELECT COUNT(*) as count FROM users');
    const count = parseInt(userCheck.rows[0].count, 10);

    if (count > 0) {
      console.log(`Database already seeded (${count} users found).`);
      return;
    }

    console.log('Seeding initial data...');

    // 1. Users
    const salt = await bcrypt.genSalt(10);
    const userPass = await bcrypt.hash('password123', salt);
    const adminPass = await bcrypt.hash('admin123', salt);

    // Kshitij Kolte (from reference screenshot)
    const userRes = await db.query(
      `INSERT INTO users (name, email, phone, password_hash, role, avatar_initials, green_km_driven)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      ['Kshitij Kolte', 'kshitijkolte4@gmail.com', '+918767974390', userPass, 'user', 'KK', 592.97]
    );
    const userId = userRes.rows[0].id;

    // Admin User
    const adminRes = await db.query(
      `INSERT INTO users (name, email, phone, password_hash, role, avatar_initials, green_km_driven)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      ['Admin Manager', 'admin@chargerhub.in', '+919999988888', adminPass, 'admin', 'AD', 1240.50]
    );
    const adminId = adminRes.rows[0].id;

    // 2. Wallet for Kshitij Kolte (matching ₹ 53.00 from screenshot)
    const walletRes = await db.query(
      `INSERT INTO wallets (user_id, balance, coins) VALUES ($1, $2, $3) RETURNING id`,
      [userId, 53.00, 150]
    );
    const walletId = walletRes.rows[0].id;

    // Wallet for Admin
    await db.query(
      `INSERT INTO wallets (user_id, balance, coins) VALUES ($1, $2, $3)`,
      [adminId, 5000.00, 1000]
    );

    // 3. Transactions for Kshitij Kolte (matching screenshot: - ₹ 27, - ₹ 1, - ₹ 27)
    await db.query(
      `INSERT INTO transactions (wallet_id, type, amount, payment_method, station_name, description, reference_id, created_at)
       VALUES 
       ($1, 'debit', 27.00, 'Wallet', 'ChargerHub Dynamic Grandeur Station', 'Charging Session #CHB-9842', 'TXN-984210', NOW() - INTERVAL '3 hours'),
       ($1, 'debit', 1.00, 'Wallet', 'ChargerHub Dynamic Grandeur Station', 'Charger Handshake Auth', 'TXN-984180', NOW() - INTERVAL '7 hours'),
       ($1, 'debit', 27.00, 'Wallet', 'ChargerHub Dynamic Grandeur Station', 'Charging Session #CHB-9811', 'TXN-981105', NOW() - INTERVAL '1 day'),
       ($1, 'credit', 200.00, 'UPI', NULL, 'Wallet Topup via Google Pay', 'TXN-980001', NOW() - INTERVAL '2 days')`,
      [walletId]
    );

    // 4. Vehicles for Kshitij Kolte (matching screenshot: 2-Wheeler MH12XB2903)
    await db.query(
      `INSERT INTO vehicles (user_id, type, brand, model, registration_no, battery_capacity_kwh, connector_type, current_battery_pct, is_primary)
       VALUES 
       ($1, '2-Wheeler', 'Ather', 'Ather 450X', 'MH12XB2903', 3.7, 'Wall Socket', 52, true),
       ($1, '4-Wheeler', 'Tata', 'Tata Nexon EV', 'MH12EV4421', 40.5, 'CCS2', 68, false)`,
      [userId]
    );

    // 5. Stations (Pune EV Charging Network matching reference screenshot)
    const stationsData = [
      {
        name: 'ChargerHub Dynamic Grandeur Station',
        address: 'Dynamic Grandeur, Wadachi Wadi Road, Undri, Pune',
        city: 'Pune',
        lat: 18.4552,
        lng: 73.9189,
        rating: 4.3,
        reviews: 673,
        connectors: [
          { charger: 'SmartPlug 746 Dynamic Grandeur', conn: 'Connector 1', type: 'Wall Socket', kw: 3.3, current: 'AC', price: 15.0, status: 'Available' },
          { charger: 'SmartPlug 747 Dynamic Grandeur', conn: 'Connector 1', type: 'Wall Socket', kw: 3.3, current: 'AC', price: 15.0, status: 'Available' },
          { charger: 'Grandeur Fast Charge DC-30', conn: 'CCS2 Gun 1', type: 'CCS2', kw: 30.0, current: 'DC', price: 21.0, status: 'Available' }
        ]
      },
      {
        name: 'ChargerHub Seasons Mall Hub',
        address: 'Magarpatta City, Hadapsar, Pune',
        city: 'Pune',
        lat: 18.5196,
        lng: 73.9312,
        rating: 4.6,
        reviews: 412,
        connectors: [
          { charger: 'Seasons AC Fast 7.4', conn: 'Connector 1', type: 'Type 2', kw: 7.4, current: 'AC', price: 16.0, status: 'Available' },
          { charger: 'Seasons Dual CCS2 60kW', conn: 'Gun A', type: 'CCS2', kw: 60.0, current: 'DC', price: 22.0, status: 'Busy' }
        ]
      },
      {
        name: 'ChargerHub Phoenix Marketcity Hub',
        address: 'S No. 207, Viman Nagar Road, Pune',
        city: 'Pune',
        lat: 18.5621,
        lng: 73.9168,
        rating: 4.5,
        reviews: 890,
        connectors: [
          { charger: 'Phoenix Ultra-Fast 60kW', conn: 'Gun 1', type: 'CCS2', kw: 60.0, current: 'DC', price: 22.0, status: 'Available' },
          { charger: 'Phoenix Commercial AC 22', conn: 'Type 2 Gun', type: 'Type 2', kw: 22.0, current: 'AC', price: 18.0, status: 'Available' }
        ]
      },
      {
        name: 'ChargerHub Pavillion Mall Hub',
        address: 'Senapati Bapat Road, Shivajinagar, Pune',
        city: 'Pune',
        lat: 18.5326,
        lng: 73.8322,
        rating: 4.7,
        reviews: 520,
        connectors: [
          { charger: 'Pavillion Smart Fast DC', conn: 'Connector 1', type: 'CCS2', kw: 50.0, current: 'DC', price: 21.0, status: 'Available' },
          { charger: 'Pavillion AC Slow 3.3', conn: 'Wall 16A', type: 'Wall Socket', kw: 3.3, current: 'AC', price: 14.0, status: 'Available' }
        ]
      },
      {
        name: 'ChargerHub Hinjewadi Phase 1 Hub',
        address: 'Near Cognizant, Hinjewadi Rajiv Gandhi Infotech Park, Pune',
        city: 'Pune',
        lat: 18.5913,
        lng: 73.7389,
        rating: 4.4,
        reviews: 340,
        connectors: [
          { charger: 'TechPark AC 11kW', conn: 'Type 2 Gun', type: 'Type 2', kw: 11.0, current: 'AC', price: 16.0, status: 'Available' },
          { charger: 'TechPark DC 50kW', conn: 'CCS2 Gun', type: 'CCS2', kw: 50.0, current: 'DC', price: 22.0, status: 'Offline' }
        ]
      },
      {
        name: 'ChargerHub Baner High Street Hub',
        address: 'Balewadi High Street, Baner, Pune',
        city: 'Pune',
        lat: 18.5590,
        lng: 73.7868,
        rating: 4.8,
        reviews: 750,
        connectors: [
          { charger: 'HighStreet DC 60kW', conn: 'Gun 1', type: 'CCS2', kw: 60.0, current: 'DC', price: 22.0, status: 'Available' },
          { charger: 'HighStreet AC 7.4kW', conn: 'Connector 1', type: 'Type 2', kw: 7.4, current: 'AC', price: 15.0, status: 'Available' }
        ]
      },
      {
        name: 'ChargerHub Amanora Town Centre',
        address: 'Amanora Park Town, Hadapsar, Pune',
        city: 'Pune',
        lat: 18.5178,
        lng: 73.9360,
        rating: 4.4,
        reviews: 290,
        connectors: [
          { charger: 'Amanora Fast Charger 50kW', conn: 'CCS2', type: 'CCS2', kw: 50.0, current: 'DC', price: 21.0, status: 'Available' }
        ]
      },
      {
        name: 'ChargerHub Kothrud Metro Hub',
        address: 'Ideal Colony Metro Station, Paud Road, Kothrud, Pune',
        city: 'Pune',
        lat: 18.5074,
        lng: 73.8077,
        rating: 4.6,
        reviews: 460,
        connectors: [
          { charger: 'Metro AC 7.4kW', conn: 'Type 2', type: 'Type 2', kw: 7.4, current: 'AC', price: 15.0, status: 'Available' },
          { charger: 'Metro Wall Socket 3.3kW', conn: 'Wall 16A', type: 'Wall Socket', kw: 3.3, current: 'AC', price: 14.0, status: 'Available' }
        ]
      }
    ];

    for (const s of stationsData) {
      const stRes = await db.query(
        `INSERT INTO stations (name, address, city, latitude, longitude, rating, total_reviews, is_open_24h, is_public)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, true) RETURNING id`,
        [s.name, s.address, s.city, s.lat, s.lng, s.rating, s.reviews]
      );
      const stationId = stRes.rows[0].id;

      for (const c of s.connectors) {
        await db.query(
          `INSERT INTO connectors (station_id, charger_name, connector_name, connector_type, power_kw, current_type, price_per_kwh, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [stationId, c.charger, c.conn, c.type, c.kw, c.current, c.price, c.status]
        );
      }
    }

    // 6. Shop Products (Matching reference screenshot: Nectar 7.4kW & 11kW)
    await db.query(`
      INSERT INTO products (name, category, description, power_spec, connector_type, color, price, original_price, image_url, in_stock)
      VALUES 
      ('Nectar - 7.4kW', 'Home Chargers', 'Smart residential wall-mounted AC EV Charger with app scheduling & RFID lock.', '7.4kW', 'Type 2', 'Night BLACK', 35999.00, 50000.00, 'https://images.unsplash.com/photo-1558441719-8b449c6ff673?w=600&auto=format&fit=crop&q=80', true),
      ('Nectar - 11kW', 'Home Chargers', 'High-performance 3-Phase AC Charger designed for fast residential & office EV top-ups.', '11kW', 'Type 2', 'Night BLACK', 40999.00, 65000.00, 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&auto=format&fit=crop&q=80', true),
      ('Nectar - 22kW Commercial', 'Home Chargers', 'Heavy duty dual-output commercial wallbox with OCPP 1.6J and MID meter.', '22kW', 'Type 2', 'Night BLACK', 58999.00, 75000.00, 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=600&auto=format&fit=crop&q=80', true),
      ('ChargerHub RFID Smart Keycard', 'RFID', 'Tap-and-charge contactless RFID card compatible with 5000+ public chargers.', 'NFC', 'RFID', 'Matte Black', 499.00, 999.00, 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=600&auto=format&fit=crop&q=80', true),
      ('Heavy Duty 3.3kW Portable Cable', 'Portable Chargers', 'Rugged IP66 waterproof portable 16A charging cord with Indian 3-pin plug.', '3.3kW', 'Wall Socket', 'Titanium Grey', 14999.00, 18500.00, 'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=600&auto=format&fit=crop&q=80', true),
      ('Type 2 to Type 2 32A 5M Cable', 'Accessories', 'TÜV certified spiral 5-meter EV charging extension cable with carry bag.', '22kW', 'Type 2', 'Neon Green Accents', 8499.00, 12000.00, 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&auto=format&fit=crop&q=80', true)
    `);

    // 7. Buzz Posts (Matching reference screenshot: Monsoon Charge Fest)
    await db.query(`
      INSERT INTO buzz_posts (author_name, author_badge, title, content, image_url, category, likes_count, created_at)
      VALUES 
      ('ChargerHub Official', 'Verified Partner', 'Monsoon Charge Fest ⚡', 'Last Chance to claim 30% uncapped cashback as ChargerHub Coins on recharges of ₹2,999 or more! Offer valid till midnight. Tap below to recharge and save big on highway fast chargers.', 'https://images.unsplash.com/photo-1558441719-8b449c6ff673?w=800&auto=format&fit=crop&q=80', 'Offers', 284, NOW() - INTERVAL '1 day'),
      ('Rohan Deshmukh', 'EV Explorer', 'Pune to Lonavala Weekend Trip ⛰️', 'Cruised up the ghats with 72% SoC in our Nexon EV! Quick 20-minute coffee top-up at ChargerHub Khalapur Hub. Range anxiety is officially a thing of the past.', 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80', 'Trips', 142, NOW() - INTERVAL '2 days'),
      ('Priya Sharma', 'Green Warrior', 'Home Charger Installation Review', 'Installed the ChargerHub Nectar 7.4kW yesterday in Pune. Smooth 3-hour installation by certified technicians. 100% full battery every morning before commute!', 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&auto=format&fit=crop&q=80', '#ChargerHub', 96, NOW() - INTERVAL '3 days')
    `);

    // 8. Notifications
    await db.query(`
      INSERT INTO notifications (user_id, title, message, type)
      VALUES 
      ($1, 'Welcome to ChargerHub EV!', 'Your account has been registered. You have earned ₹25 joining ChargerHub Coins.', 'system'),
      ($1, 'Monsoon Charge Fest ☔', 'Get 30% cashback on wallet recharge before midnight.', 'promo')
    `, [userId]);

    console.log('✅ Seed completed successfully with demo user, Pune stations, products, and posts!');
  } catch (err) {
    console.error('❌ Error during seeding:', err);
  }
}

if (process.argv[1].endsWith('seedRunner.js')) {
  runSeeds().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
