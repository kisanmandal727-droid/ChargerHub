# ⚡ Statiq EV Charging Platform

A mobile-first EV charging web application that helps users find charging stations, manage charging sessions, track expenses, and plan EV trips.

## 🌐 Live Demo

**Live Website:** https://chargerhub-web.onrender.com

**GitHub Repository:** https://github.com/kisanmandal727-droid/ChargerHub

## 🚀 Features

- **Authentication:** Email/password and Google login.
- **Vehicle Management:** Register and manage electric vehicles.
- **Live Charging Map:** Find nearby charging stations using Leaflet and OpenStreetMap.
- **Charging Management:** Calculate charging costs and monitor live sessions.
- **Digital Wallet:** Manage balance and add credits using Razorpay.
- **Trip Planner:** Plan routes and find charging stations along the way.
- **EV Shop:** Explore EV chargers and accessories.
- **Community Feed:** Share updates and view offers.
- **Admin Dashboard:** Manage charging stations and monitor sessions.
- **Charger Simulator:** Simulate real-time charger data using Python.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| React 18 + Vite | Frontend |
| Node.js + Express | Backend |
| Firebase Authentication | Authentication |
| Cloud Firestore | Database |
| Leaflet + OpenStreetMap | Maps |
| Razorpay | Payment Integration |
| Python | Charger Simulator |
| Render | Deployment |

## 💻 Installation & Setup

### Prerequisites

- Node.js (v20 or later)
- npm
- Python 3.8 or later
- Firebase project

### 1. Clone the Repository

```bash
git clone https://github.com/kisanmandal727-droid/ChargerHub.git
cd ChargerHub
```

### 2. Start Backend

```bash
cd server
npm install
```

Configure `server/.env` using `server/.env.example`.

```bash
npm start
```

### 3. Start Frontend

Open a new terminal:

```bash
cd client
npm install
```

Configure `client/.env` using `client/.env.example`.

```bash
npm run dev
```

### 4. Run Python Simulator (Optional)

```bash
cd simulator
python charger_sim.py --mode=test
```

## 🔐 Environment Configuration

- Configure Firebase credentials for authentication and database access.
- Add Razorpay credentials to the backend environment for payment integration.
- Never upload `.env` files or Firebase service-account credentials to GitHub.

## 🌍 Deployment

The project is configured for deployment on **Render** using `render.yaml`.

It includes two services:

- Frontend – React static website
- Backend – Node.js API

Configure the required environment variables in Render before deployment.

## 📌 Project Status

Developed as an EV charging platform with frontend, backend, Firebase integration, wallet functionality, and charger simulation.
