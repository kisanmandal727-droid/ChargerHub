import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { Search, SlidersHorizontal, Navigation, List, MapPin, Zap, ChevronRight, Check, Sparkles, Plus } from 'lucide-react';
import { api } from '../../api/client.js';
import { useLocation } from '../../context/LocationContext.jsx';
import { useVehicle } from '../../context/VehicleContext.jsx';

export default function MapView({ onSelectStation, onNavigateTab }) {
  const { location, requestLiveLocation, locating } = useLocation();
  const { primaryVehicle } = useVehicle();

  const [stations, setStations] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationsError, setStationsError] = useState('');
  const [selectedStation, setSelectedStation] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [fastOnly, setFastOnly] = useState(false);
  const [offersOnly, setOffersOnly] = useState(false);
  const [viewMode, setViewMode] = useState('map'); // 'map' | 'list'
  const floatingControlsBottom = selectedStation && viewMode === 'map'
    ? 'calc(var(--bottom-nav-clearance, 68px) + 140px)'
    : 'calc(var(--bottom-nav-clearance, 68px) + 36px)';

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const userMarkerRef = useRef(null);

  // Fetch stations from API
  const fetchStations = async () => {
    setStationsLoading(true);
    setStationsError('');
    try {
      let endpoint = `/stations?lat=${location.lat}&lng=${location.lng}`;
      if (searchQuery) endpoint += `&q=${encodeURIComponent(searchQuery)}`;
      if (availableOnly) endpoint += `&status=Available`;
      if (fastOnly) endpoint += `&fastOnly=true`;

      const data = await api.get(endpoint);
      const nextStations = data.stations || [];
      setStations(nextStations);
      setSelectedStation((current) =>
        nextStations.find((station) => Number(station.id) === Number(current?.id)) || nextStations[0] || null
      );
    } catch (err) {
      console.error('Error fetching map stations:', err);
      setStationsError(err.message || 'Unable to load charging stations.');
    } finally {
      setStationsLoading(false);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [location, availableOnly, fastOnly, searchQuery]);

  useEffect(() => {
    if (viewMode !== 'map' || !mapInstanceRef.current) return undefined;
    const timer = window.setTimeout(() => mapInstanceRef.current?.invalidateSize(), 0);
    return () => window.clearTimeout(timer);
  }, [viewMode]);

  useEffect(() => {
    const mapElement = mapContainerRef.current;
    if (!mapElement || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => mapInstanceRef.current?.invalidateSize({ pan: false }));
    observer.observe(mapElement);
    return () => observer.disconnect();
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [location.lat, location.lng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false
      });

      // Free OpenStreetMap tiles — no API key required
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      markersGroupRef.current = L.featureGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      markersGroupRef.current = null;
      userMarkerRef.current = null;
    };
  }, []);

  // Update User Location Pin
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
    }

    // Custom user location pin with pulsing red radar aura (matching screenshot!)
    const userIconHtml = `
      <div class="custom-user-marker">
        <div class="user-pulse-ring"></div>
        <div class="user-car-circle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="none">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9C2.1 11 2 11.2 2 11.5V16c0 .6.4 1 1 1h2m14 0v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1m14 0H5"/>
            <circle cx="7.5" cy="16.5" r="2.5"/>
            <circle cx="16.5" cy="16.5" r="2.5"/>
          </svg>
        </div>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userIconHtml,
      className: '',
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    userMarkerRef.current = L.marker([location.lat, location.lng], { icon: userIcon }).addTo(map);
  }, [location]);

  // Update Station Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    stations.forEach((station) => {
      const isAvailable = station.hasAvailable;
      const isBusy = station.computedStatus === 'Busy';
      const pinClass = isAvailable ? 'pin-available' : isBusy ? 'pin-busy' : 'pin-offline';

      const iconHtml = `
        <div class="station-pin ${pinClass}">
          <div class="station-pin-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      });

      const marker = L.marker([station.latitude, station.longitude], { icon: customIcon });
      marker.on('click', () => {
        setSelectedStation(station);
        map.panTo([station.latitude, station.longitude], { animate: true });
      });

      markersGroup.addLayer(marker);
    });
  }, [stations]);

  const handleRecenter = () => {
    requestLiveLocation();
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([location.lat, location.lng], 14, { animate: true });
    }
  };

  return (
    <div className="map-view" style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Top Floating Search & Filter Bar (Matching Screenshot) */}
      <div className="map-toolbar" style={{
        position: 'absolute',
        top: 'var(--map-inset, 12px)',
        left: 'var(--map-inset, 12px)',
        right: 'var(--map-inset, 12px)',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {/* Search input with filter icon */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#FFFFFF',
          borderRadius: '16px',
          padding: '6px 8px 6px 14px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
        }}>
          <Search size={18} color="#717B9E" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Charger..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              fontWeight: 600,
              color: '#151C38',
              fontFamily: 'inherit'
            }}
          />
          <button
            onClick={() => setFastOnly(!fastOnly)}
            style={{
              background: fastOnly ? '#151C38' : '#F1F4FA',
              border: 'none',
              borderRadius: '12px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative'
            }}
          >
            <SlidersHorizontal size={16} color={fastOnly ? '#FFFFFF' : '#151C38'} />
            <span style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#00C896'
            }} />
          </button>
        </div>

        {/* Filter Chips Bar (Matching Screenshot: Available x, Fast charger, Offers, Reservations) */}
        <div className="chips-scroll" style={{ padding: '0 4px' }}>
          <button
            type="button"
            onClick={() => setAvailableOnly(!availableOnly)}
            className={`chip-btn ${availableOnly ? 'active' : ''}`}
            style={availableOnly ? { background: '#151C38', color: '#FFFFFF' } : {}}
          >
            <span>Available</span>
            {availableOnly && <span>✕</span>}
          </button>

          <button
            type="button"
            onClick={() => setFastOnly(!fastOnly)}
            className={`chip-btn ${fastOnly ? 'active' : ''}`}
          >
            <Zap size={14} color="#00C896" />
            <span>Fast charger</span>
          </button>

          <button
            type="button"
            onClick={() => setOffersOnly(!offersOnly)}
            className={`chip-btn ${offersOnly ? 'active' : ''}`}
          >
            <Sparkles size={14} color="#00C896" />
            <span>Offers</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('trips')}
            className="chip-btn"
          >
            <span>Plan Trip</span>
          </button>
        </div>
      </div>

      {/* Map or List View */}
      <div
        ref={mapContainerRef}
        aria-hidden={viewMode !== 'map'}
        style={{ width: '100%', height: '100%', display: viewMode === 'map' ? 'block' : 'none' }}
      />

      {viewMode === 'list' && (
        <div className="map-list-panel" style={{ flex: 1, overflowY: 'auto', padding: '90px 16px 140px', background: '#F8FAFC' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#151C38', marginBottom: '12px' }}>
            Nearby EV Chargers ({stations.length})
          </h3>
          {stations.length === 0 && (
            <p style={{ color: '#68718B', fontSize: '14px', lineHeight: 1.5 }}>
              {stationsLoading ? 'Loading charging stations…' : stationsError || 'No charging stations were found.'}
            </p>
          )}
          {stations.map((st) => (
            <div
              key={st.id}
              onClick={() => onSelectStation(st)}
              className="card"
              style={{ cursor: 'pointer', marginBottom: '10px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#151C38' }}>{st.name}</h4>
                <span className={`status-pill ${st.hasAvailable ? 'available' : 'busy'}`}>
                  {st.hasAvailable ? 'Available' : 'Busy'}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#68718B', marginBottom: '8px' }}>{st.address}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#00C896' }}>
                <span>{st.distanceText || 'Nearby'}</span>
                <span>{st.connectors?.length || 0} Connectors</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'map' && stations.length === 0 && (
        <div className="station-load-message" role={stationsError ? 'alert' : 'status'}>
          <div>
            <strong>{stationsLoading ? 'Finding nearby chargers…' : stationsError ? 'Stations could not be loaded' : 'No chargers found here'}</strong>
            <p>
              {stationsLoading
                ? 'Loading charging stations for this area.'
                : stationsError
                  ? stationsError
                  : 'Try another area or check that the backend has demo station data.'}
            </p>
          </div>
          {!stationsLoading && (
            <button type="button" onClick={fetchStations} className="btn-secondary">
              Try again
            </button>
          )}
        </div>
      )}

      {/* Floating Action Buttons (Matching Screenshot) */}
      <div style={{
        position: 'absolute',
        bottom: floatingControlsBottom,
        left: 16,
        zIndex: 700
      }}>
        <button
          onClick={handleRecenter}
          type="button"
          title="Recenter Location"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: '#FFFFFF',
            border: 'none',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <Navigation size={20} color="#00C896" style={{ transform: 'rotate(-45deg)' }} />
        </button>
      </div>

      <div style={{
        position: 'absolute',
        bottom: floatingControlsBottom,
        right: 16,
        zIndex: 700,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {/* Toggle List/Map */}
        <button
          onClick={() => setViewMode(viewMode === 'map' ? 'list' : 'map')}
          type="button"
          title="Toggle List View"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: '#FFFFFF',
            border: 'none',
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <List size={20} color="#151C38" />
        </button>
      </div>

      {/* Bottom Swipeable Station Card Preview (Exact Matching Reference Screenshot!) */}
      {selectedStation && viewMode === 'map' && (
        <div
          className="map-station-preview"
          onClick={() => onSelectStation(selectedStation)}
          style={{
            position: 'absolute',
            bottom: 'calc(var(--bottom-nav-clearance, 68px) + 6px)',
            left: 'var(--map-card-left, 12px)',
            right: 'var(--map-card-right, 12px)',
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '14px 16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 600,
            cursor: 'pointer',
            border: '1px solid #EAEFF8',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            {/* Station Logo Avatar */}
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#151C38',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '18px',
              flexShrink: 0
            }}>
              CH
            </div>

            {/* Station Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{
                fontSize: '14px',
                fontWeight: 800,
                color: '#151C38',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {selectedStation.name}
              </h3>
              <p style={{
                fontSize: '12px',
                color: '#68718B',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginBottom: '6px'
              }}>
                {selectedStation.address}
              </p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  background: '#F1F4FA',
                  color: '#151C38',
                  padding: '2px 8px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  AC
                </span>
                <span style={{
                  background: '#F1F4FA',
                  color: '#151C38',
                  padding: '2px 8px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  3.3kW - 50kW
                </span>
              </div>
            </div>

            {/* Distance & Status Right Column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>
                {selectedStation.distanceText || '28m away'}
              </span>
              <span className={`status-pill ${selectedStation.hasAvailable ? 'available' : 'busy'}`}>
                {selectedStation.hasAvailable ? '✓ Available' : 'Busy'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
