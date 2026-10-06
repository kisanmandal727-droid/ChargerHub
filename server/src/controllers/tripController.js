import db from '../db/firestore.js';

const GEOCODER_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const ROUTER_URL = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const GEOCODE_CACHE = new Map();
let geocodeQueue = Promise.resolve();
let lastGeocodeRequestAt = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function firestoreRoutePoints(coordinates) {
  if (!Array.isArray(coordinates)) return [];
  const points = coordinates.flatMap((point) => {
    const lat = Number(Array.isArray(point) ? point[0] : point?.lat);
    const lng = Number(Array.isArray(point) ? point[1] : point?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? [{ lat, lng }]
      : [];
  });
  const maxPoints = 1000;
  if (points.length <= maxPoints) return points;
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * (points.length - 1) / (maxPoints - 1))]);
}

function geocodeAddress(query) {
  const cacheKey = String(query || '').trim().toLowerCase();
  if (!cacheKey) return Promise.reject(new Error('Enter a starting point and destination.'));
  if (GEOCODE_CACHE.has(cacheKey)) return Promise.resolve(GEOCODE_CACHE.get(cacheKey));

  const request = geocodeQueue.then(async () => {
    const delay = Math.max(0, 1000 - (Date.now() - lastGeocodeRequestAt));
    if (delay) await wait(delay);
    lastGeocodeRequestAt = Date.now();

    const url = new URL(GEOCODER_URL);
    url.searchParams.set('q', String(query).trim());
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'in');
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ChargerHub EV Trip Planner/1.0',
        'Accept-Language': 'en'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('Location search is temporarily unavailable. Please try again.');
    const results = await response.json();
    if (!results.length) throw new Error('Could not find "' + String(query).trim() + '". Try adding the city or full address.');

    const place = {
      lat: Number(results[0].lat),
      lng: Number(results[0].lon),
      label: results[0].display_name || String(query).trim()
    };
    GEOCODE_CACHE.set(cacheKey, place);
    return place;
  });
  geocodeQueue = request.catch(() => {});
  return request;
}

function distanceFromRouteKm(pointLat, pointLng, routeCoordinates) {
  if (!routeCoordinates.length) return Infinity;
  if (routeCoordinates.length === 1) {
    const latDelta = (pointLat - routeCoordinates[0][0]) * 111.32;
    const lngDelta = (pointLng - routeCoordinates[0][1]) * 111.32 * Math.cos(pointLat * Math.PI / 180);
    return Math.sqrt(latDelta * latDelta + lngDelta * lngDelta);
  }

  let shortest = Infinity;
  for (let index = 0; index < routeCoordinates.length - 1; index += 1) {
    const start = routeCoordinates[index];
    const end = routeCoordinates[index + 1];
    const midLat = (start[0] + end[0] + pointLat) / 3;
    const longitudeScale = 111.32 * Math.cos(midLat * Math.PI / 180);
    const sx = start[1] * longitudeScale;
    const sy = start[0] * 111.32;
    const ex = end[1] * longitudeScale;
    const ey = end[0] * 111.32;
    const px = pointLng * longitudeScale;
    const py = pointLat * 111.32;
    const dx = ex - sx;
    const dy = ey - sy;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared ? Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared)) : 0;
    const deltaX = px - (sx + fraction * dx);
    const deltaY = py - (sy + fraction * dy);
    shortest = Math.min(shortest, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
  }
  return shortest;
}

export const planTrip = async (req, res) => {
  try {
    const userId = req.user.id;
    const { origin, destination, detour_km = 5, vehicle_id, origin_lat, origin_lng } = req.body;
    if (!String(origin || '').trim() || !String(destination || '').trim()) {
      return res.status(400).json({ error: 'Enter both a starting point and a destination.' });
    }

    const hasOriginCoordinates = origin_lat !== undefined && origin_lat !== null
      && origin_lng !== undefined && origin_lng !== null
      && Number.isFinite(Number(origin_lat)) && Number.isFinite(Number(origin_lng));
    if (hasOriginCoordinates && (Math.abs(Number(origin_lat)) > 90 || Math.abs(Number(origin_lng)) > 180)) {
      return res.status(400).json({ error: 'The starting location coordinates are invalid. Allow location access or enter an address.' });
    }
    const originLocation = hasOriginCoordinates
      ? { lat: Number(origin_lat), lng: Number(origin_lng), label: String(origin).trim() }
      : await geocodeAddress(origin);
    const destinationLocation = await geocodeAddress(destination);

    const routeCoordinatesParam = [originLocation.lng + ',' + originLocation.lat, destinationLocation.lng + ',' + destinationLocation.lat].join(';');
    const routeUrl = ROUTER_URL + '/route/v1/driving/' + routeCoordinatesParam + '?overview=full&geometries=geojson&steps=false';
    const routeResponse = await fetch(routeUrl, { signal: AbortSignal.timeout(20000) });
    if (!routeResponse.ok) throw new Error('Road routing is temporarily unavailable. Please try again.');
    const routeData = await routeResponse.json();
    const route = routeData.routes && routeData.routes[0];
    if (routeData.code !== 'Ok' || !route || !route.geometry || !route.geometry.coordinates) {
      return res.status(422).json({ error: 'No driving route was found for those locations. Check the addresses and try again.' });
    }
    const routeCoordinates = route.geometry.coordinates.map((coordinate) => [Number(coordinate[1]), Number(coordinate[0])]);
    const distanceKm = Number((route.distance / 1000).toFixed(1));
    const durationMins = Math.max(1, Math.round(route.duration / 60));

    let batteryCapacity = 30;
    let currentSoc = 75;
    let vehicleModel = 'EV Vehicle';
    if (vehicle_id) {
      const vehicle = await db.get('vehicles', vehicle_id);
      if (vehicle && Number(vehicle.user_id) === Number(userId)) {
        batteryCapacity = Number(vehicle.battery_capacity_kwh) || batteryCapacity;
        currentSoc = Number(vehicle.current_battery_pct ?? currentSoc);
        vehicleModel = vehicle.model || vehicleModel;
      }
    } else {
      const vehicles = await db.where('vehicles', 'user_id', Number(userId));
      vehicles.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
      if (vehicles.length) {
        batteryCapacity = Number(vehicles[0].battery_capacity_kwh) || batteryCapacity;
        currentSoc = Number(vehicles[0].current_battery_pct ?? currentSoc);
        vehicleModel = vehicles[0].model || vehicleModel;
      }
    }

    const isTwoWheeler = batteryCapacity < 10;
    const consumptionRate = isTwoWheeler ? 0.035 : 0.15;
    const energyNeeded = Number((distanceKm * consumptionRate).toFixed(2));
    const batteryPctNeeded = Math.round((energyNeeded / batteryCapacity) * 100);
    const remainingSoc = Math.max(0, Math.round(currentSoc - batteryPctNeeded));

    const maxDetour = Math.max(0, Number(detour_km) || 0);
    const stations = (await db.list('stations')).filter((station) => station.is_active !== false);
    const candidates = stations
      .map((station) => {
        const lat = Number(station.latitude);
        const lng = Number(station.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const offRouteKm = distanceFromRouteKm(lat, lng, routeCoordinates);
        const detourKm = offRouteKm * 2;
        return { station, lat, lng, detourKm };
      })
      .filter((item) => item && item.detourKm <= maxDetour)
      .sort((a, b) => a.detourKm - b.detourKm)
      .slice(0, 4);

    const suggestedStations = await Promise.all(candidates.map(async ({ station, lat, lng, detourKm }) => {
      const connectors = await db.where('connectors', 'station_id', Number(station.id));
      const roundedDetour = Number(detourKm.toFixed(1));
      return {
        id: station.id,
        name: station.name,
        address: station.address,
        latitude: lat,
        longitude: lng,
        rating: Number(station.rating) || null,
        detourKm: roundedDetour,
        detourText: '+' + roundedDetour.toFixed(1) + ' km estimated detour',
        connectorsCount: connectors.length,
        fastAvailable: connectors.some((connector) => Number(connector.power_kw) >= 22 && String(connector.status).toLowerCase() === 'available')
      };
    }));

    return res.json({
      trip: {
        origin: String(origin).trim(),
        destination: String(destination).trim(),
        origin_location: originLocation,
        destination_location: destinationLocation,
        route_coordinates: routeCoordinates,
        route_source: 'OpenStreetMap / OSRM',
        distance_km: distanceKm,
        duration_mins: durationMins,
        vehicleModel,
        current_soc_pct: currentSoc,
        battery_capacity_kwh: batteryCapacity,
        est_energy_kwh: energyNeeded,
        est_battery_pct: batteryPctNeeded,
        remaining_soc_pct: remainingSoc,
        needs_charging: remainingSoc < 15,
        detour_km: maxDetour,
        suggested_stations: suggestedStations
      }
    });
  } catch (err) {
    console.error('Plan trip error:', err);
    return res.status(502).json({ error: err.message || 'Failed to plan trip' });
  }
};

export const saveTrip = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      origin_name,
      destination_name,
      distance_km,
      duration_mins,
      est_battery_pct,
      detour_km,
      suggested_stations,
      origin_location,
      destination_location,
      route_coordinates,
      route_source
    } = req.body;
    if (!origin_name || !destination_name) return res.status(400).json({ error: 'Origin and destination are required to save a trip.' });

    const trip = await db.create('saved_trips', {
      user_id: Number(userId),
      origin_name,
      destination_name,
      distance_km: Number(distance_km),
      duration_mins: Number(duration_mins),
      est_battery_pct: Number(est_battery_pct),
      detour_km: Number(detour_km || 5),
      suggested_stations: suggested_stations || [],
      origin_location: origin_location || null,
      destination_location: destination_location || null,
      // Firestore rejects nested arrays such as [[lat, lng], ...]. Store sampled points as maps.
      route_coordinates: firestoreRoutePoints(route_coordinates),
      route_source: route_source || 'OpenStreetMap / OSRM'
    });
    return res.status(201).json({ message: 'Trip saved successfully', trip });
  } catch (err) {
    console.error('Save trip error:', err);
    return res.status(500).json({ error: 'Failed to save trip' });
  }
};

export const getSavedTrips = async (req, res) => {
  try {
    const userId = req.user.id;
    const savedTrips = await db.where('saved_trips', 'user_id', Number(userId));
    savedTrips.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return res.json({ savedTrips });
  } catch (err) {
    console.error('Get saved trips error:', err);
    return res.status(500).json({ error: 'Failed to get saved trips' });
  }
};

export const deleteSavedTrip = async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    if (!Number.isSafeInteger(tripId) || tripId <= 0) return res.status(400).json({ error: 'Invalid saved trip.' });

    const trip = await db.get('saved_trips', tripId);
    if (!trip || Number(trip.user_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: 'Saved trip not found.' });
    }

    await db.delete('saved_trips', tripId);
    return res.json({ message: 'Saved trip deleted.', tripId });
  } catch (err) {
    console.error('Delete saved trip error:', err);
    return res.status(500).json({ error: 'Could not delete this saved trip.' });
  }
};
