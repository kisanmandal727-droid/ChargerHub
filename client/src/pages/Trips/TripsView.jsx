import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { Navigation, ChevronRight, Zap, ArrowLeft, Bookmark, Trash2, RefreshCw, Route } from 'lucide-react';
import { api } from '../../api/client.js';
import { useLocation } from '../../context/LocationContext.jsx';
import { useVehicle } from '../../context/VehicleContext.jsx';

export default function TripsView({ onSelectStation, startInSaved = false, onStartViewConsumed }) {
  const { location, hasPermission, locating, error: locationError, requestLiveLocation } = useLocation();
  const { primaryVehicle } = useVehicle();

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [detourKm, setDetourKm] = useState('5');
  const [tripPlan, setTripPlan] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [planError, setPlanError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedTrips, setSavedTrips] = useState([]);
  const [savedTripsLoading, setSavedTripsLoading] = useState(true);
  const [savedTripsError, setSavedTripsError] = useState('');
  const [activeView, setActiveView] = useState(startInSaved ? 'saved' : 'planner');
  const [deletingTripId, setDeletingTripId] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkerRef = useRef(null);
  const routeLineRef = useRef(null);

  useEffect(() => {
    if (hasPermission && !origin) setOrigin('Current location');
  }, [hasPermission, origin]);

  const fetchSavedTrips = useCallback(async () => {
    setSavedTripsLoading(true);
    setSavedTripsError('');
    try {
      const res = await api.get('/trips/saved');
      setSavedTrips(res.savedTrips || []);
    } catch (err) {
      console.error('Saved trips error:', err);
      setSavedTripsError(err.message || 'Could not load saved trips.');
    } finally {
      setSavedTripsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedTrips();
  }, [fetchSavedTrips]);

  useEffect(() => {
    if (startInSaved) onStartViewConsumed?.();
  }, [startInSaved, onStartViewConsumed]);
  // Initialize mini background map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: hasPermission ? [location.lat, location.lng] : [18.5204, 73.8567],
        zoom: 12,
        zoomControl: false,
        attributionControl: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // User location marker
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

      if (hasPermission) {
        userMarkerRef.current = L.marker([location.lat, location.lng], {
          icon: L.divIcon({ html: userIconHtml, className: '', iconSize: [44, 44], iconAnchor: [22, 22] })
        }).addTo(map);
      }

      mapInstanceRef.current = map;
    }
  }, [location, hasPermission]);

  useEffect(() => {
    if (hasPermission && mapInstanceRef.current) {
      mapInstanceRef.current.setView([location.lat, location.lng], 13);
      if (userMarkerRef.current) userMarkerRef.current.setLatLng([location.lat, location.lng]);
      else userMarkerRef.current = L.circleMarker([location.lat, location.lng], {
        radius: 7,
        color: '#FFFFFF',
        weight: 3,
        fillColor: '#00A87E',
        fillOpacity: 1
      }).addTo(mapInstanceRef.current);
    }
  }, [location, hasPermission]);

  useEffect(() => () => {
    if (mapInstanceRef.current) mapInstanceRef.current.remove();
    mapInstanceRef.current = null;
    userMarkerRef.current = null;
    routeLineRef.current = null;
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (routeLineRef.current) {
      routeLineRef.current.remove();
      routeLineRef.current = null;
    }
    if (!tripPlan?.route_coordinates?.length) return;
    routeLineRef.current = L.polyline(tripPlan.route_coordinates, {
      color: '#00A87E',
      weight: 5,
      opacity: 0.9
    }).addTo(map);
    map.fitBounds(routeLineRef.current.getBounds(), { padding: [22, 22], maxZoom: 13 });
  }, [tripPlan]);

  const handlePlanTrip = async (destValue) => {
    const dest = destValue || destination;
    if (!origin.trim()) {
      setPlanError('Enter a starting address or allow location access first.');
      return;
    }
    if (!dest.trim()) {
      setPlanError('Enter a destination to calculate the route.');
      return;
    }

    setPlanning(true);
    setPlanError('');
    setTripPlan(null);
    try {
      const res = await api.post('/trips/plan', {
        origin,
        destination: dest.trim(),
        detour_km: parseFloat(detourKm),
        vehicle_id: primaryVehicle?.id,
        ...(origin === 'Current location' && hasPermission ? {
          origin_lat: location.lat,
          origin_lng: location.lng
        } : {})
      });
      setTripPlan(res.trip);
    } catch (err) {
      console.error('Trip plan error:', err);
      setPlanError(err.message || 'Could not calculate this trip. Check the addresses and try again.');
    } finally {
      setPlanning(false);
    }
  };

  const handleSaveTrip = async () => {
    if (!tripPlan || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.post('/trips/save', {
        origin_name: tripPlan.origin,
        destination_name: tripPlan.destination,
        distance_km: tripPlan.distance_km,
        duration_mins: tripPlan.duration_mins,
        est_battery_pct: tripPlan.est_battery_pct,
        detour_km: tripPlan.detour_km,
        suggested_stations: tripPlan.suggested_stations,
        origin_location: tripPlan.origin_location,
        destination_location: tripPlan.destination_location,
        route_coordinates: tripPlan.route_coordinates,
        route_source: tripPlan.route_source
      });
      if (res.trip) setSavedTrips((previous) => [res.trip, ...previous.filter((trip) => trip.id !== res.trip.id)]);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      setSaveError(err.message || 'Could not save this trip. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTrip = async (trip) => {
    const destinationName = trip.destination_name || 'this trip';
    if (!window.confirm(`Delete the saved trip to ${destinationName}? This cannot be undone.`)) return;
    setDeletingTripId(trip.id);
    setSavedTripsError('');
    try {
      await api.delete(`/trips/saved/${trip.id}`);
      setSavedTrips((current) => current.filter((item) => String(item.id) !== String(trip.id)));
    } catch (err) {
      setSavedTripsError(err.message || 'Could not delete this saved trip.');
    } finally {
      setDeletingTripId(null);
    }
  };

  const startNavigation = (trip) => {
    const originPlace = trip.origin_location;
    const destinationPlace = trip.destination_location;
    const originValue = originPlace && Number.isFinite(Number(originPlace.lat)) && Number.isFinite(Number(originPlace.lng))
      ? Number(originPlace.lat) + ',' + Number(originPlace.lng)
      : (trip.origin || trip.origin_name || '');
    const destinationValue = destinationPlace && Number.isFinite(Number(destinationPlace.lat)) && Number.isFinite(Number(destinationPlace.lng))
      ? Number(destinationPlace.lat) + ',' + Number(destinationPlace.lng)
      : (trip.destination || trip.destination_name || '');
    if (!originValue || !destinationValue) {
      setPlanError('This saved trip does not contain a usable route. Plan it again to navigate.');
      return;
    }
    const mapsUrl = 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(originValue)
      + '&destination=' + encodeURIComponent(destinationValue) + '&travelmode=driving';
    const opened = window.open(mapsUrl, '_blank');
    if (opened) opened.opener = null;
    if (!opened) window.location.assign(mapsUrl);
  };

  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Background Map */}
      <div className="trips-background-map" ref={mapContainerRef} style={{ width: '100%', height: '52%', position: 'absolute', top: 0, left: 0, right: 0 }} />

      {/* Top Floating Badges matching screenshot */}
      <div className="trips-floating-badges" style={{
        position: 'absolute',
        top: 14,
        left: 16,
        right: 16,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Detour Pill */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '6px 14px',
          fontSize: '12px',
          fontWeight: 700,
          color: '#151C38',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
        }}>
          Detour - {detourKm}km
        </div>

        {/* Shortcut to the saved trips page */}
        <button
          className="trips-saved-shortcut"
          type="button"
          onClick={() => setActiveView('saved')}
          aria-label="Open saved trips"
          title="Open saved trips"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: '#FFFFFF',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            cursor: 'pointer'
          }}
        >
          <Bookmark size={18} color="#151C38" />
        </button>
      </div>

      {/* Bottom Sheet Card matching screenshot */}
      <div className="trip-planner-card" style={{
        position: 'absolute',
        bottom: 'var(--bottom-nav-clearance, 68px)',
        left: 0,
        right: 0,
        background: '#FFFFFF',
        borderTopLeftRadius: '28px',
        borderTopRightRadius: '28px',
        boxShadow: '0 -6px 24px rgba(0,0,0,0.12)',
        padding: '24px 20px 20px',
        zIndex: 600,
        maxHeight: '62%',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#151C38', margin: 0 }}>
            Plan your next trip
          </h3>
          <button
            type="button"
            onClick={() => setActiveView('saved')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0, border: '1px solid #BFEBDD', borderRadius: '10px', background: '#EAF9F3', color: '#087E63', padding: '8px 10px', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
          >
            <Bookmark size={14} /> Saved ({savedTrips.length})
          </button>
        </div>
        <p style={{ fontSize: '13px', color: '#68718B', marginBottom: '20px', lineHeight: '1.4' }}>
          Tackle your range anxiety with our hassle - free charging experience on your next trip.
        </p>
        <p style={{ fontSize: '11px', color: '#68718B', marginTop: '-12px', marginBottom: '16px' }}>
          Your locations are sent to OpenStreetMap services to calculate the route. Drive time is an estimate without live traffic. © OpenStreetMap contributors.
        </p>

        {/* Start / Destination connected inputs matching screenshot */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
          {/* Vertical Connected Dots Indicator */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '18px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94A3B8' }} />
            <div style={{ width: '2px', height: '36px', borderLeft: '2px dashed #CBD5E1', margin: '4px 0' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00C896' }} />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="Starting address or current location"
              style={{
                width: '100%',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#151C38',
                outline: 'none'
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (hasPermission) setOrigin('Current location');
                else {
                  setOrigin('');
                  requestLiveLocation();
                }
              }}
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                color: '#007A5C',
                border: 'none',
                padding: '2px 4px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              <Navigation size={14} />
              {locating ? 'Finding your location…' : hasPermission ? 'Use current location' : 'Use my location'}
            </button>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePlanTrip()}
              placeholder="Enter Destination"
              style={{
                width: '100%',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '14px',
                fontWeight: 600,
                color: '#151C38',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Plan Trip Button */}
        {!tripPlan && (
          <button
            type="button"
            onClick={() => handlePlanTrip()}
            disabled={planning || !destination.trim()}
            className="btn-primary"
            style={{ background: '#00C896' }}
          >
            {planning ? 'Analyzing Route & Chargers...' : 'Calculate Route & Battery'}
          </button>
        )}
        {locationError && !hasPermission && (
          <p style={{ color: '#92400E', fontSize: '12px', marginTop: '8px' }}>
            Location permission is unavailable. Enter a starting address to plan this trip.
          </p>
        )}
        {planError && (
          <p role="alert" style={{ color: '#B91C1C', background: '#FEF2F2', borderRadius: '10px', padding: '10px 12px', fontSize: '12px', fontWeight: 700, marginTop: '10px' }}>
            {planError}
          </p>
        )}

        {/* Trip Results Card */}
        {tripPlan && (
          <div style={{ marginTop: '12px' }}>
            <div style={{
              background: '#F8FAFC',
              borderRadius: '18px',
              padding: '16px',
              border: '1px solid #E2E8F0',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', textAlign: 'center', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#68718B', fontWeight: 600 }}>DISTANCE</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#151C38' }}>{tripPlan.distance_km} km</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#68718B', fontWeight: 600 }}>DRIVE TIME EST.</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#151C38' }}>{tripPlan.duration_mins} min</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#68718B', fontWeight: 600 }}>BATTERY USE</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: tripPlan.needs_charging ? '#EF4444' : '#10B981' }}>
                    {tripPlan.est_battery_pct}%
                  </div>
                </div>
              </div>

              {tripPlan.needs_charging && (
                <div style={{
                  background: '#FEF3C7',
                  border: '1px solid #FCD34D',
                  color: '#92400E',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Zap size={14} color="#D97706" />
                  <span>En-route charging recommended. Remaining SoC: {tripPlan.remaining_soc_pct}%</span>
                </div>
              )}
              <p style={{ fontSize: '11px', color: '#68718B', marginBottom: '14px' }}>
                Drive time and battery use are estimates; they do not include live traffic or road conditions.
              </p>

              {/* Suggested En-route Charging Stations */}
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#151C38', marginBottom: '8px' }}>
                CHARGERHUB STOPS NEAR THIS ROUTE:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(tripPlan.suggested_stations || []).map((s) => (
                  <div
                    key={s.id}
                    onClick={() => onSelectStation && onSelectStation(s)}
                    style={{
                      background: '#FFFFFF',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: '#10B981', fontWeight: 700 }}>{s.detourText}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#00C896', fontSize: '12px', fontWeight: 700 }}>
                      <span>View</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                ))}
                {!tripPlan.suggested_stations?.length && (
                  <p style={{ color: '#68718B', fontSize: '12px' }}>No ChargerHub stations in the saved station list are within this detour distance.</p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handleSaveTrip}
                disabled={saving}
                className="btn-secondary"
                style={{ flex: 1 }}
              >
                {saving ? 'Saving…' : savedSuccess ? '✓ Saved!' : 'Save Trip'}
              </button>
              <button
                type="button"
                onClick={() => startNavigation(tripPlan)}
                className="btn-primary"
                style={{ flex: 2, background: '#00C896' }}
              >
                Start Navigation
              </button>
            </div>
            {saveError && (
              <p role="alert" style={{ color: '#B91C1C', fontSize: '12px', marginTop: '8px' }}>{saveError}</p>
            )}
            <button
              type="button"
              onClick={() => { setTripPlan(null); setPlanError(''); setSaveError(''); }}
              style={{ background: 'none', border: 'none', color: '#007A5C', fontSize: '12px', fontWeight: 800, marginTop: '10px', cursor: 'pointer' }}
            >
              Plan a different trip
            </button>
          </div>
        )}

      </div>

      {activeView === 'saved' && (
        <section className="trips-saved-view" aria-label="Saved trips" style={{ position: 'absolute', top: 0, right: 0, bottom: 'var(--bottom-nav-clearance, 68px)', left: 0, zIndex: 900, display: 'flex', flexDirection: 'column', background: '#F8FAFC' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '15px 18px', background: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
            <button type="button" onClick={() => setActiveView('planner')} aria-label="Back to trip planner" style={{ display: 'grid', placeItems: 'center', width: '36px', height: '36px', flexShrink: 0, border: 0, borderRadius: '50%', background: '#F1F5F9', color: '#151C38', cursor: 'pointer' }}>
              <ArrowLeft size={19} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: 0, color: '#151C38', fontSize: '17px', fontWeight: 900 }}>Saved trips</h3>
              <p style={{ margin: '3px 0 0', color: '#68718B', fontSize: '11px' }}>Your routes saved to this account</p>
            </div>
            <button type="button" onClick={fetchSavedTrips} disabled={savedTripsLoading} aria-label="Refresh saved trips" title="Refresh saved trips" style={{ display: 'grid', placeItems: 'center', width: '36px', height: '36px', flexShrink: 0, border: '1px solid #E2E8F0', borderRadius: '10px', background: '#FFFFFF', color: '#475569', cursor: savedTripsLoading ? 'wait' : 'pointer' }}>
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="trips-saved-list" style={{ flex: 1, overflowY: 'auto', padding: '15px 16px 24px' }}>
            {savedTripsLoading && <p role="status" style={{ padding: '24px 10px', textAlign: 'center', color: '#68718B', fontSize: '13px' }}>Loading saved trips…</p>}
            {savedTripsError && (
              <div role="alert" style={{ marginBottom: '12px', border: '1px solid #FECACA', borderRadius: '12px', padding: '11px 12px', background: '#FEF2F2', color: '#B91C1C', fontSize: '12px', fontWeight: 700 }}>
                {savedTripsError}
                <button type="button" onClick={fetchSavedTrips} style={{ marginLeft: '9px', border: 0, background: 'transparent', color: '#991B1B', fontWeight: 900, cursor: 'pointer' }}>Retry</button>
              </div>
            )}
            {!savedTripsLoading && !savedTripsError && savedTrips.length === 0 && (
              <div style={{ padding: '42px 20px', textAlign: 'center', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px' }}>
                <span style={{ display: 'inline-grid', placeItems: 'center', width: '50px', height: '50px', borderRadius: '16px', background: '#EAF9F3', color: '#087E63' }}><Route size={24} /></span>
                <h4 style={{ margin: '13px 0 5px', color: '#151C38', fontSize: '14px', fontWeight: 900 }}>No saved trips yet</h4>
                <p style={{ margin: 0, color: '#68718B', fontSize: '12px', lineHeight: 1.5 }}>Plan a route and choose Save Trip to keep it here.</p>
              </div>
            )}
            {!savedTripsLoading && savedTrips.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {savedTrips.map((trip) => (
                  <article key={trip.id} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '14px', boxShadow: '0 2px 8px rgba(15,23,42,0.03)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ display: 'grid', placeItems: 'center', width: '36px', height: '36px', flexShrink: 0, borderRadius: '11px', background: '#EAF9F3', color: '#087E63' }}><Route size={17} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ margin: '1px 0 5px', color: '#151C38', fontSize: '14px', fontWeight: 900, overflowWrap: 'anywhere' }}>{trip.destination_name || 'Saved destination'}</h4>
                        <p style={{ margin: 0, color: '#68718B', fontSize: '11px', lineHeight: 1.45, overflowWrap: 'anywhere' }}>From {trip.origin_name || 'Starting location'}</p>
                      </div>
                      <button type="button" onClick={() => handleDeleteTrip(trip)} disabled={deletingTripId !== null} aria-label={`Delete trip to ${trip.destination_name || 'destination'}`} title="Delete saved trip" style={{ display: 'grid', placeItems: 'center', width: '34px', height: '34px', flexShrink: 0, border: '1px solid #FECACA', borderRadius: '10px', background: '#FEF2F2', color: '#B91C1C', cursor: deletingTripId === trip.id ? 'wait' : 'pointer', opacity: deletingTripId !== null && deletingTripId !== trip.id ? 0.5 : 1 }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', margin: '12px 0', color: '#475569', fontSize: '11px', fontWeight: 700 }}>
                      <span style={{ padding: '5px 8px', borderRadius: '8px', background: '#F1F5F9' }}>{Number(trip.distance_km) || 0} km</span>
                      <span style={{ padding: '5px 8px', borderRadius: '8px', background: '#F1F5F9' }}>{Number(trip.duration_mins) || 0} min</span>
                      <span style={{ padding: '5px 8px', borderRadius: '8px', background: '#F1F5F9' }}>{Number(trip.est_battery_pct) || 0}% estimated battery</span>
                    </div>
                    <button type="button" onClick={() => startNavigation(trip)} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px', border: 0, borderRadius: '11px', background: '#00A87E', color: '#FFFFFF', padding: '10px 12px', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}>
                      <Navigation size={15} /> Start navigation
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}


