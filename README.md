# ⚡ Statiq EV Charging Platform (Phase 1)

A fully functional, mobile-first EV charging web application inspired by the modern **Statiq EV** reference designs. Features live Leaflet map with custom status markers, forced first-time EV onboarding, real-time charger simulation, dynamic session cost & energy calculation, virtual wallet with UPI/Card top-ups, route & range anxiety trip planner, EV shop, community buzz feed, admin hardware override console, and an OCPP-ready Python charger telemetry simulator.

---

## 📸 Core Features & Flow

```
Email/Password or Google Sign-In ➔ Forced Vehicle Setup ➔ Location Permission ➔ Interactive Map ➔ Station Details ➔ Connector Selection ➔ Dynamic Session Config ➔ Real-Time Active Charging ➔ Wallet Deduction ➔ Activity History
```

1. **Authentication & Profile**:
   - Firebase email/password and Google sign-in, server-verified Firebase ID tokens, and app sessions. Phone numbers are profile details; the app does not send SMS codes.
   - User profile with initials avatar (`KK`), contact info, and green environmental impact tracking (`592.97 GREEN km driven 🍃`).
   - Admin accounts use the same login page and are authorized through Firestore.

2. **Forced Vehicle Setup (Core Requirement)**:
   - If a newly registered or logged-in user has 0 vehicles, the app automatically forces vehicle setup before permitting access to the main dashboard or map.
   - 6 brand tabs (`All`, `Tata`, `MG`, `BMW`, `2-Wheeler`, `3-Wheeler`), vehicle cards with battery capacity and connector badges.
   - Registration number modal (`MH12XB2903`) with quote: *"Just once! Register your vehicle now, and we'll remember it for you."*

3. **Leaflet & OpenStreetMap**:
   - User location pin with animated radar-pulsing red glow (matching reference screenshot).
   - Custom pins indicating live charger statuses (`Available` green, `Busy` amber, `Offline` grey).
   - Search bar with filter chips (`Available ✕`, `⚡ Fast charger`, `🏷️ Offers`, `Plan Trip`).
   - Bottom peek preview card showing station name, address snippet, distance (`28m away`), connector type (`AC`), and availability pill (`✓ Available`).

4. **Station Details & Connectors**:
   - Header with rating badge (`4.3 ★ (673)`), mini map thumbnail, and open hours (`🕒 Open Now`, `⏰ 24 Hours`, `🌐 Public`).
   - Charger cards (`SmartPlug 746 Dynamic Grandeur`, `₹15/kWh`, `[AC]`, `[3.3kW]`, `Last used: 36 mins ago`) with selectable connector list.

5. **Dynamic Charging Calculator & Live Session**:
   - 4 modes: `Amount` (₹), `Units` (kWh), `Time` (mins), `Percentage` (%).
   - Real-time dynamic calculation: dynamically computes estimated time (`⏱️ 28 mins`), units (`⚡ 1.5 units`), and cost (`💰 ₹27`).
   - Animated SVG circular battery gauge displaying live SoC %, delivered energy, charging speed (kW), and live cost.
   - Stop/pause controls and automatic wallet deduction on completion with itemized receipt modal.

6. **Wallet & Payment System**:
   - Total balance (`₹ 53.00`) and Statiq Coins balance.
   - Add Credits uses Razorpay Checkout. Wallet credits are added only after the server verifies the Razorpay signature and confirms the captured payment.
   - Grouped transaction activity by date with clear debit (`- ₹ 27`) and credit (`+ ₹ 200`) badges.

7. **Trip & Route Range Planner**:
   - Start location and destination input with `Detour - 5km` radius filter.
   - Calculates route distance, travel duration, and battery consumption (% and kWh) based on selected EV.
   - Recommends en-route charging hubs.

8. **Shop & Community Buzz**:
   - Statiq Shop: Home EV chargers (`Nectar 7.4kW`, `Nectar 11kW`), portable cords, and RFID cards with checkout simulation.
   - Statiq Buzz: Community social feed featuring Monsoon Charge Fest (30% cashback offer) with likes and bookmarks.

9. **Admin & Simulator Console**:
   - Real-time hardware status toggling (`Available`, `Busy`, `Offline`, `Faulted`). Changes sync instantly to the map.
   - Ongoing charging sessions monitor with force-stop control.
   - Platform metrics: total users, fleet size, stations, revenue, and delivered energy.

10. **Python Charger Simulator**:
    - Standalone Python service simulating real-time EVSE hardware telemetry (`kW`, `kWh`, `SoC %`, `Voltage`, `Current`) with realistic lithium-ion battery taper curves.
    - Emits structured OCPP 1.6J `MeterValues` payloads.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: React 18, Vite, Leaflet, Lucide Icons, Mobile-First CSS design matching Statiq screenshots.
- **Backend**: Node.js, Express, REST APIs, WebSockets, Firebase Admin SDK, JWT, and Bcrypt. Express remains the service layer for charging, the hardware simulator, and Razorpay.
- **Database**: Cloud Firestore stores application data (accounts, vehicles, stations, connectors, charging sessions, wallet records, reservations, trips, shop orders, posts, and notifications). The server accesses Firestore through Firebase Admin; browser Firestore access is denied by the included rules.
- **Simulator**: Python 3 with `requests` library.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v20+) & npm
- Python 3.8+ (for hardware simulator)
- A Firebase project with Authentication and Cloud Firestore enabled

---

### Step 1: Start the Backend Server

```bash
cd server
npm install
npm start
```
Before starting, copy `server/.env.example` to `server/.env` and set the Firebase project ID and service-account file path. The server starts on `http://localhost:5000` and seeds Firestore demo collections the first time it runs.

For Razorpay, set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `server/.env` from your Razorpay Dashboard. Use test credentials while developing. The key secret stays on the backend and must never be added to frontend files.

### Step 2: Start the React Frontend

```bash
cd client
npm install
npm run dev
```
*Frontend opens on `http://localhost:3000`.*

Before starting, copy `client/.env.example` to `client/.env` and enter the Firebase web app values. The frontend uses the local Vite proxy by default. If it is hosted separately, set `VITE_API_BASE_URL` (see `client/.env.example`) to the backend API URL, including `/api`.

### Firebase Sign-In and Admin Access

The login page supports Firebase email/password and Google sign-in. Firebase verifies each user; the server verifies the Firebase ID token and creates or updates the app profile in Firestore. The signup phone number is profile information and is not SMS-verified. Email/password and Google sign-in do not require enabling Firebase Phone Authentication.

1. In the [Firebase Console](https://console.firebase.google.com/), open your project. Add a **Web app** under **Project settings → Your apps** if one does not exist, then create a **Cloud Firestore** database in production mode.
2. In the left menu, open **Build → Authentication → Get started** if Authentication is not set up yet.
3. In **Authentication → Sign-in method**, open **Email/Password**, turn on the Email/Password switch, and save. Then open **Google**, turn it on, choose a project support email if prompted, and save.
4. In **Authentication → Settings → Authorized domains**, make sure `localhost` is present for local work. Add the Render website hostname here after deployment.
5. Open **Project settings → General → Your apps → Web app** and copy the web config values to `client/.env` (or to the website's Render environment variables): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`.
6. Create a Firebase service account for the backend. Keep its JSON outside the project and configure `FIREBASE_PROJECT_ID` and the service-account credential in `server/.env` or the Render API service. Never put the service-account JSON in the client, GitHub, or a shared ZIP.
7. In **Firestore Database → Rules**, publish the root `firestore.rules` file. App records are accessed by the server using Firebase Admin; keep browser reads and writes blocked.
8. To make a Firebase account an admin, first create its account with the normal signup or Google button. In **Authentication → Users**, copy that account's **UID**. Then open **Firestore Database → Data → Start collection**. Name the collection `admin_users`; set the document ID to the copied UID; add a Boolean field named `enabled` with value `true`; save. The same login page is used for admins and regular users. Set `enabled` to `false` or remove that document to revoke admin access.
9. Restart the client and server. On first sign-in, ChargerHub creates a user profile and starter wallet automatically.

These sign-in providers are available on Firebase's no-cost Spark plan; no SMS billing is needed. The Firebase web config belongs in the frontend; the service-account credential belongs only on the server. Do not commit `.env` files or the service-account JSON. See the [Firebase email/password guide](https://firebase.google.com/docs/auth/web/password-auth) and [Google sign-in guide](https://firebase.google.com/docs/auth/web/google-signin).

---

### Step 3: Run the Python Charger Simulator

In a separate terminal:

```bash
cd simulator
# Run quick telemetry test
python charger_sim.py --mode=test

# Or simulate active charging session
python charger_sim.py --mode=sim --session=1 --start_soc=30 --target_soc=80 --power=22.0 --price=15.0
```

---

## 🌐 Deploy the App to Render

The root `render.yaml` file defines two Render services: a static React website and a Node.js API. The website build reads the API address from the API service, and the API serves the `/api/health` health check. Both services use the free plan for a demo deployment.

### Before you begin

- Put this project in a GitHub repository. The repository root must contain `render.yaml`, `client/`, and `server/`.
- Do not upload `.env` files or Firebase service-account JSON files. `.gitignore` excludes them; keep it in place.
- Have the Firebase web app settings and the backend service-account JSON ready. Enable Email/Password and Google in Firebase Authentication and make sure Cloud Firestore is created.

### Create the Render services

1. Sign in at [Render](https://render.com/) and connect your GitHub account if prompted.
2. In the Render Dashboard, choose **New** → **Blueprint**.
3. Select the GitHub repository containing this project, then choose **Apply**.
4. When Render requests the values marked as secrets, fill them in:
   - `FIREBASE_PROJECT_ID`: your Firebase project ID.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: open the service-account JSON on your computer and paste its full contents into Render's secret field. Never paste this file into GitHub or the website's Firebase settings.
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`: copy these from Firebase Console → Project settings → Your apps → your Web app.
5. Click **Apply** / **Deploy** and wait for both `chargerhub-api` and `chargerhub-web` to show **Live**. The API may take a little time on its first start while it connects to Firestore and seeds demo data.
6. Open the API service URL followed by `/api/health`. A JSON response with `"status":"online"` means the API is reachable.
7. Copy the website's `onrender.com` hostname. In Firebase Console, open **Authentication** → **Settings** → **Authorized domains** → **Add domain**. Enter only the hostname (no `https://` or path), then save.
8. Open the website URL and test email/password signup and Google sign-in. If you change Firebase web app settings later, update the website's environment variables in Render and redeploy the static site.

### Optional: enable Razorpay wallet top-ups

For this demo, use Razorpay test credentials only. In the API service, open **Environment** and add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` from your Razorpay Dashboard; keep the secret only in the API service. Do not add live keys yet: live checkout can collect real money, and Render's free plan is intended for demos rather than production.

### Free-plan behavior

Render's free web service can go idle after 15 minutes without incoming traffic and may take about a minute to wake on the next request. This is suitable for demos; it can make the first login or API request feel slow. The app stores its application data in Firestore, while the charger activity shown by this project is simulated in software.

---

## 🔑 Account Access

Create an account from the login page using your name, email, phone number, and password, or use Google sign-in. There are no demo login credentials. Admin access is assigned by creating an `admin_users/{Firebase UID}` document in Firestore with `enabled: true`, as described above.

---

## 🗄️ Firestore Collections (`server/src/db/seedFirestore.js`)

- `users`: User profiles, Firebase UID, policy acceptance, role, green KM tracking.
- `admin_users`: Admin allowlist keyed by Firebase Authentication UID; only the server reads this collection.
- `vehicles`: EV models, registration numbers, battery capacities, connector types.
- `stations`: Geolocation, addresses, ratings, amenities, operating hours.
- `connectors`: Charger names, power (kW), AC/DC type, pricing, real-time statuses.
- `charging_sessions`: Active and past charging sessions, telemetry, SoC %, delivered energy, costs.
- `wallets`: User balances and reward coins.
- `transactions`: Debit and credit ledger with reference numbers and payment methods.
- `reservations`: Connector reservations with double-booking prevention.
- `saved_stations`: User bookmarked charging locations.
- `saved_trips`: Saved route plans and recommended charging stops.
- `products` & `orders`: EV charging hardware, accessories, and shipping orders.
- `buzz_posts`: Community updates, offers, and announcements.
- `notifications`: Charging and payment system alerts.

---

## 📡 API Reference Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/firebase/session` | Verify a Firebase Google or email/password ID token and connect or create the Firestore profile |
| `GET` | `/api/auth/me` | Fetch user profile, primary vehicle, and wallet |
| `GET` | `/api/vehicles/catalog` | Get EV model catalog (Tata, MG, BMW, Ather, Ola) |
| `GET` | `/api/vehicles` | List user's vehicles |
| `POST` | `/api/vehicles` | Register vehicle & set primary |
| `GET` | `/api/stations` | Query stations with user coordinates, distance & filters |
| `GET` | `/api/stations/:id` | Fetch station details with all connectors |
| `POST` | `/api/charging/calculate`| Dynamically calculate units, duration, and cost |
| `POST` | `/api/charging/start` | Validate connector/wallet & start charging |
| `GET` | `/api/charging/active` | Get live charging telemetry for active session |
| `POST` | `/api/charging/:id/stop` | End charging, finalize cost & debit wallet |
| `GET` | `/api/wallet` | Fetch wallet balance & coin statistics |
| `POST` | `/api/wallet/razorpay/order` | Create a server-side Razorpay order |
| `POST` | `/api/wallet/razorpay/verify` | Verify and credit a captured Razorpay payment |
| `GET` | `/api/wallet/transactions` | Fetch grouped transaction history |
| `POST` | `/api/reservations` | Reserve connector with conflict prevention |
| `POST` | `/api/trips/plan` | Plan EV route, estimate battery & detour stations |
| `GET` | `/api/shop/products` | Explore EV home chargers & accessories |
| `POST` | `/api/shop/orders` | Checkout shop order |
| `GET` | `/api/buzz/posts` | Community buzz feed & Monsoon fest offers |
| `PUT` | `/api/admin/connectors/:id/status` | Override charger hardware status |
