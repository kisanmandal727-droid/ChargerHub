-- PostgreSQL Schema for EV Charging Application Phase 1

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user', -- 'user' | 'admin'
  avatar_initials VARCHAR(10),
  green_km_driven NUMERIC(10, 2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Link Firebase Phone Auth identities to existing application accounts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_unique ON users(firebase_uid);

-- Vehicles Table
CREATE TABLE IF NOT EXISTS vehicles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- '2-Wheeler', '3-Wheeler', '4-Wheeler'
  brand VARCHAR(100) NOT NULL, -- 'Tata', 'MG', 'Hyundai', 'Mahindra', 'Ather', 'Ola', 'BMW'
  model VARCHAR(100) NOT NULL, -- e.g. 'Tata Nexon EV', 'Ather 450X'
  registration_no VARCHAR(50) NOT NULL, -- e.g. 'MH12XB2903'
  battery_capacity_kwh NUMERIC(6, 2) NOT NULL DEFAULT 30.0,
  connector_type VARCHAR(50) NOT NULL, -- 'Type 2', 'CCS2', 'Bharat AC001', 'Wall Socket', 'CHAdeMO'
  current_battery_pct INTEGER NOT NULL DEFAULT 50, -- 0 to 100
  is_primary BOOLEAN DEFAULT false,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stations Table
CREATE TABLE IF NOT EXISTS stations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) DEFAULT 'Pune',
  latitude NUMERIC(10, 7) NOT NULL,
  longitude NUMERIC(10, 7) NOT NULL,
  rating NUMERIC(2, 1) DEFAULT 4.5,
  total_reviews INTEGER DEFAULT 0,
  is_open_24h BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  amenities TEXT[] DEFAULT ARRAY['Restroom', 'Cafe', 'WiFi', 'Parking'],
  logo_letter VARCHAR(5) DEFAULT 'S',
  status VARCHAR(30) DEFAULT 'Active', -- 'Active', 'Maintenance', 'Closed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Connectors Table
CREATE TABLE IF NOT EXISTS connectors (
  id SERIAL PRIMARY KEY,
  station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  charger_name VARCHAR(120) NOT NULL, -- e.g. 'SmartPlug 746 Dynamic Grandeur'
  connector_name VARCHAR(60) NOT NULL, -- e.g. 'Connector 1'
  connector_type VARCHAR(50) NOT NULL, -- 'Wall Socket', 'Type 2', 'CCS2', 'CHAdeMO'
  power_kw NUMERIC(5, 1) NOT NULL DEFAULT 3.3, -- 3.3, 7.4, 11.0, 22.0, 50.0
  current_type VARCHAR(10) NOT NULL DEFAULT 'AC', -- 'AC' | 'DC'
  price_per_kwh NUMERIC(6, 2) NOT NULL DEFAULT 15.00,
  status VARCHAR(30) NOT NULL DEFAULT 'Available', -- 'Available', 'Busy', 'Offline', 'Reserved', 'Faulted'
  last_used_minutes_ago INTEGER DEFAULT 15,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Wallets Table
CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  coins INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Charging Sessions Table
CREATE TABLE IF NOT EXISTS charging_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  connector_id INTEGER NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  charge_type VARCHAR(30) NOT NULL, -- 'Amount', 'Units', 'Time', 'Percentage'
  target_value NUMERIC(8, 2) NOT NULL, -- requested value in ₹, kWh, mins, or %
  start_soc_pct INTEGER NOT NULL,
  current_soc_pct INTEGER NOT NULL,
  target_soc_pct INTEGER NOT NULL,
  power_kw NUMERIC(5, 1) NOT NULL,
  energy_delivered_kwh NUMERIC(8, 3) DEFAULT 0.000,
  unit_price NUMERIC(6, 2) NOT NULL,
  total_cost NUMERIC(8, 2) DEFAULT 0.00,
  status VARCHAR(30) NOT NULL DEFAULT 'charging', -- 'initiating', 'charging', 'paused', 'completed', 'stopped'
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES charging_sessions(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL, -- 'credit', 'debit'
  amount NUMERIC(10, 2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'Wallet', -- 'UPI', 'Card', 'Wallet', 'Promo'
  station_name VARCHAR(150),
  description VARCHAR(255) NOT NULL,
  reference_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Razorpay wallet top-ups. The unique payment_id makes crediting idempotent.
CREATE TABLE IF NOT EXISTS wallet_payment_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_order_id VARCHAR(100) NOT NULL UNIQUE,
  payment_id VARCHAR(100) UNIQUE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'created',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Reservations Table
CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connector_id INTEGER NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status VARCHAR(30) DEFAULT 'Active', -- 'Active', 'Completed', 'Cancelled', 'Expired'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Saved Stations Table
CREATE TABLE IF NOT EXISTS saved_stations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, station_id)
);

-- Saved Trips Table
CREATE TABLE IF NOT EXISTS saved_trips (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin_name VARCHAR(200) NOT NULL,
  destination_name VARCHAR(200) NOT NULL,
  distance_km NUMERIC(8, 2) NOT NULL,
  est_battery_pct INTEGER NOT NULL,
  detour_km NUMERIC(5, 1) DEFAULT 5.0,
  suggested_stations JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shop Products Table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'Home Chargers', 'Portable Chargers', 'RFID', 'Accessories'
  description TEXT,
  power_spec VARCHAR(50), -- e.g. '7.4kW', '11kW', '22kW'
  connector_type VARCHAR(50) DEFAULT 'Type 2',
  color VARCHAR(50) DEFAULT 'Night BLACK',
  price NUMERIC(10, 2) NOT NULL,
  original_price NUMERIC(10, 2),
  image_url TEXT,
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Shop Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  total_amount NUMERIC(10, 2) NOT NULL,
  shipping_address TEXT NOT NULL,
  status VARCHAR(30) DEFAULT 'Processing', -- 'Processing', 'Shipped', 'Delivered'
  order_reference VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Buzz Community Posts Table
CREATE TABLE IF NOT EXISTS buzz_posts (
  id SERIAL PRIMARY KEY,
  author_name VARCHAR(100) NOT NULL,
  author_badge VARCHAR(50) DEFAULT 'Verified',
  title VARCHAR(200),
  content TEXT NOT NULL,
  image_url TEXT,
  category VARCHAR(50) DEFAULT 'Statiq', -- 'Statiq', 'Trips', 'Offers'
  likes_count INTEGER DEFAULT 128,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'charging', -- 'charging', 'wallet', 'promo', 'system'
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
