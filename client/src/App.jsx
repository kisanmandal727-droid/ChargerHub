import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { VehicleProvider, useVehicle } from './context/VehicleContext.jsx';
import { WalletProvider, useWallet } from './context/WalletContext.jsx';
import { LocationProvider, useLocation } from './context/LocationContext.jsx';

import Login from './pages/Auth/Login.jsx';
import LegalPage from './pages/Auth/LegalPage.jsx';
import VehicleSetup from './pages/VehicleSetup/VehicleSetup.jsx';
import MapView from './pages/Map/MapView.jsx';
import SavedStationsView from './pages/Map/SavedStationsView.jsx';
import StationDetail from './pages/Station/StationDetail.jsx';
import ChargingConfig from './pages/Charging/ChargingConfig.jsx';
import ActiveCharging from './pages/Charging/ActiveCharging.jsx';
import WalletView from './pages/Wallet/WalletView.jsx';
import TripsView from './pages/Trips/TripsView.jsx';
import ShopView from './pages/Shop/ShopView.jsx';
import BuzzView from './pages/Buzz/BuzzView.jsx';
import ProfileView from './pages/Profile/ProfileView.jsx';
import AdminDashboard from './pages/Admin/AdminDashboard.jsx';

import TopHeader from './components/TopHeader.jsx';
import BottomNav from './components/BottomNav.jsx';
import VehicleSelectorModal from './components/VehicleSelectorModal.jsx';
import ReservationsModal from './pages/Reservations/ReservationsModal.jsx';
import AddCreditsModal from './components/AddCreditsModal.jsx';

import { api } from './api/client.js';

function getAuthViewFromLocation() {
  if (window.location.hash === '#signup') return 'signup';
  if (window.location.hash === '#terms-and-conditions') return 'terms';
  if (window.location.hash === '#privacy-policy') return 'privacy';
  return 'login';
}

function authHashForView(view) {
  if (view === 'signup') return '#signup';
  if (view === 'terms') return '#terms-and-conditions';
  if (view === 'privacy') return '#privacy-policy';
  return '';
}

function MainApp() {
  const { user, loading, isAuthenticated, needsVehicleSetup } = useAuth();
  const { primaryVehicle } = useVehicle();
  const { showTopupModal, setShowTopupModal } = useWallet();
  const [authView, setAuthView] = useState(getAuthViewFromLocation);

  useEffect(() => {
    const updateAuthView = () => setAuthView(getAuthViewFromLocation());
    window.addEventListener('hashchange', updateAuthView);
    window.addEventListener('popstate', updateAuthView);
    return () => {
      window.removeEventListener('hashchange', updateAuthView);
      window.removeEventListener('popstate', updateAuthView);
    };
  }, []);

  const changeAuthView = (view) => {
    const hash = authHashForView(view);
    const target = window.location.pathname + window.location.search + hash;
    if (window.location.pathname + window.location.search + window.location.hash !== target) {
      window.history.pushState({ authView: view }, '', target);
    }
    setAuthView(view);
  };

  // Navigation states
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).has('buzzPost') ? 'buzz' : 'map'); // 'map' | 'wallet' | 'shop' | 'buzz' | 'trips'
  const [activeScreen, setActiveScreen] = useState('main'); // main, station, charging_config, active_charging, profile, saved_stations, admin
  const [stationReturnScreen, setStationReturnScreen] = useState('main');
  const [startTripsInSavedView, setStartTripsInSavedView] = useState(false);

  // Contextual data
  const [selectedStation, setSelectedStation] = useState(null);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [activeSession, setActiveSession] = useState(null);

  // Modals
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [connectorToReserve, setConnectorToReserve] = useState(null);

  // Check for active charging session on load
  useEffect(() => {
    if (isAuthenticated) {
      api.get('/charging/active').then((res) => {
        if (res.activeSession) {
          setActiveSession(res.activeSession);
          setActiveScreen('active_charging');
        }
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="mobile-viewport" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#151C38', color: 'white' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '42px', fontWeight: 900, letterSpacing: '2px', color: '#00C896' }}>chargerhub</div>
          <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '6px' }}>Powering Electric Mobility...</p>
        </div>
      </div>
    );
  }

  if (authView === 'terms' || authView === 'privacy') {
    return (
      <div className="mobile-viewport auth-viewport">
        <LegalPage type={authView} onBack={() => changeAuthView('login')} onChangeView={changeAuthView} />
      </div>
    );
  }

  // 1. Not authenticated: show the regular sign-in and sign-up screen.
  if (!isAuthenticated) {
    return (
      <div className="mobile-viewport auth-viewport">
        <Login view={authView} onChangeView={changeAuthView} />
      </div>
    );
  }

  // 2. FORCED VEHICLE SETUP: If user logged in and has 0 vehicles!
  // "After first login, if no vehicle exists, force vehicle setup before accessing the main app."
  if (needsVehicleSetup) {
    return (
      <div className="mobile-viewport onboarding-viewport">
        <VehicleSetup
          onComplete={() => {
            // Once vehicle added, needsVehicleSetup becomes false
            setActiveTab('map');
            setActiveScreen('main');
          }}
        />
      </div>
    );
  }

  // Handle Station Selection from Map or Trips
  const handleSelectStation = async (station) => {
    setStationReturnScreen(activeScreen);
    try {
      const fullStation = await api.get(`/stations/${station.id}`);
      setSelectedStation(fullStation.station);
      setActiveScreen('station');
    } catch (err) {
      setSelectedStation(station);
      setActiveScreen('station');
    }
  };

  // Handle Connector Selection from Station Details
  const handleSelectConnector = (connector) => {
    setSelectedConnector(connector);
    setActiveScreen('charging_config');
  };

  // Handle Starting Session from Charging Config
  const handleProceedToActive = (session) => {
    setActiveSession(session);
    setActiveScreen('active_charging');
  };

  const handleOpenReservations = (connector = null) => {
    setConnectorToReserve(connector);
    setShowReservationModal(true);
  };

  return (
    <div className={`mobile-viewport app-shell ${activeScreen === 'main' ? '' : 'app-shell-focused'}`}>
      {/* Top Header - visible on main tab screens and non-fullscreen pages */}
      {activeScreen === 'main' && (
        <TopHeader
          onOpenVehicles={() => setShowVehiclePicker(true)}
          onOpenProfile={() => setActiveScreen('profile')}
          onOpenAdmin={() => setActiveScreen('admin')}
        />
      )}

      {/* Screen Routing */}
      <div className="app-main-content">
        {/* Active Charging Screen */}
        {activeScreen === 'active_charging' && (
          <ActiveCharging
            initialSession={activeSession}
            onSessionFinished={() => {
              setActiveSession(null);
              setActiveScreen('main');
              setActiveTab('wallet');
            }}
            onViewHistory={() => {
              setActiveSession(null);
              setActiveScreen('main');
              setActiveTab('wallet');
            }}
          />
        )}

        {/* Station Details Screen */}
        {activeScreen === 'station' && (
          <StationDetail
            station={selectedStation}
            onBack={() => setActiveScreen(stationReturnScreen)}
            onSelectConnector={handleSelectConnector}
            onReserveConnector={(conn) => handleOpenReservations(conn)}
          />
        )}

        {/* Charging Config (Select Charging Type) */}
        {activeScreen === 'charging_config' && (
          <ChargingConfig
            station={selectedStation}
            connector={selectedConnector}
            onBack={() => setActiveScreen('station')}
            onProceedToActive={handleProceedToActive}
          />
        )}

        {/* Profile Screen */}
        {activeScreen === 'profile' && (
          <ProfileView
            onBack={() => setActiveScreen('main')}
            onOpenVehicles={() => setShowVehiclePicker(true)}
            onOpenReservations={() => handleOpenReservations(null)}
            onOpenOrders={() => { setActiveScreen('main'); setActiveTab('shop'); }}
            onOpenSavedStations={() => setActiveScreen('saved_stations')}
            onOpenTrips={() => { setStartTripsInSavedView(true); setActiveScreen('main'); setActiveTab('trips'); }}
          />
        )}

        {activeScreen === 'saved_stations' && (
          <SavedStationsView
            onBack={() => setActiveScreen('profile')}
            onSelectStation={handleSelectStation}
          />
        )}

        {/* Admin Console */}
        {activeScreen === 'admin' && (
          <AdminDashboard onBack={() => setActiveScreen('main')} />
        )}

        {/* Main Tab Screens */}
        {activeScreen === 'main' && (
          <>
            {activeTab === 'map' && (
              <MapView
                onSelectStation={handleSelectStation}
                onNavigateTab={(tab) => setActiveTab(tab)}
              />
            )}
            {activeTab === 'wallet' && <WalletView />}
            {activeTab === 'shop' && <ShopView />}
            {activeTab === 'buzz' && <BuzzView />}
            {activeTab === 'trips' && <TripsView onSelectStation={handleSelectStation} startInSaved={startTripsInSavedView} onStartViewConsumed={() => setStartTripsInSavedView(false)} />}
          </>
        )}
      </div>

      {/* Bottom Navigation Bar - visible when on main screen */}
      {activeScreen === 'main' && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
          }}
        />
      )}

      {/* Vehicle Picker Bottom Sheet */}
      <VehicleSelectorModal
        isOpen={showVehiclePicker}
        onClose={() => setShowVehiclePicker(false)}
        onAddNew={() => setShowAddVehicleModal(true)}
      />

      {/* Add New Vehicle Modal */}
      {showAddVehicleModal && (
        <div className="modal-overlay">
          <div style={{ width: '100%', height: '90vh', background: 'white', borderTopLeftRadius: '28px', borderTopRightRadius: '28px', overflow: 'hidden' }}>
            <VehicleSetup
              isModal={true}
              onClose={() => setShowAddVehicleModal(false)}
              onComplete={() => setShowAddVehicleModal(false)}
            />
          </div>
        </div>
      )}

      {/* Reservations Modal */}
      <ReservationsModal
        isOpen={showReservationModal}
        connectorToBook={connectorToReserve}
        onClose={() => {
          setShowReservationModal(false);
          setConnectorToReserve(null);
        }}
        onBookSuccess={() => {
          setShowReservationModal(false);
          setConnectorToReserve(null);
        }}
      />

      {/* Add Credits Modal */}
      <AddCreditsModal
        isOpen={showTopupModal}
        onClose={() => setShowTopupModal(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <VehicleProvider>
        <WalletProvider>
          <LocationProvider>
            <MainApp />
          </LocationProvider>
        </WalletProvider>
      </VehicleProvider>
    </AuthProvider>
  );
}



