import db from '../db/firestore.js';
import { randomUUID } from 'node:crypto';

const nearbyAmenitiesCache = new Map();
const AMENITIES_RADIUS_METERS = 800;
const AMENITIES_CACHE_TTL_MS = 60 * 60 * 1000;
const AMENITIES_STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GEOAPIFY_CATEGORIES = [
  'accommodation.hotel',
  'accommodation.hostel',
  'accommodation.guest_house',
  'accommodation.motel',
  'amenity.toilet',
  'catering.cafe',
  'catering.restaurant',
  'catering.fast_food',
  'catering.food_court',
  'commercial.convenience',
  'commercial.supermarket',
  'commercial.department_store',
  'commercial.shopping_mall',
  'commercial.kiosk',
  'parking',
].join(',');

function getOverpassEndpoints() {
  return [...new Set([
    process.env.OVERPASS_API_URL,
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ].filter(Boolean))];
}

async function fetchGeoapifyAmenities(latitude, longitude, apiKey) {
  const url = new URL('https://api.geoapify.com/v2/places');
  url.search = new URLSearchParams({
    categories: GEOAPIFY_CATEGORIES,
    filter: `circle:${longitude},${latitude},${AMENITIES_RADIUS_METERS}`,
    bias: `proximity:${longitude},${latitude}`,
    limit: '50',
    lang: 'en',
    apiKey,
  }).toString();

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    const error = new Error(`Geoapify returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  if (!Array.isArray(payload.features)) throw new Error('Geoapify returned an invalid nearby places response');
  return payload.features;
}

async function fetchOverpassAmenities(query) {
  let lastError;

  for (const endpoint of getOverpassEndpoints()) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'ChargerHub/1.0 (nearby station amenities)',
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(11500),
      });
      if (!response.ok) {
        const error = new Error(`Provider returned HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const payload = await response.json();
      if (!Array.isArray(payload.elements)) throw new Error('Provider returned an invalid amenities response');
      return payload;
    } catch (error) {
      lastError = error;
      console.warn(`Nearby amenities provider failed (${endpoint}):`, error.message);
      // Timeouts and rate limits should not trigger more requests to public
      // instances. The client will use station data and the area-map fallback.
      if (error.name === 'TimeoutError' || error.name === 'AbortError' || error.status === 429) break;
    }
  }

  throw lastError || new Error('No nearby amenities provider is configured');
}

function distanceInMeters(lat1, lng1, lat2, lng2) {
  const toRadians = (value) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildNearbyAmenityGroups(elements, stationLat, stationLng) {
  const uniqueElements = [...new Map(elements.map((element) => [`${element.type}-${element.id}`, element])).values()];
  const definitions = [
    { id: 'restroom', label: 'Restroom', icon: '🚻', matches: (tags) => tags.amenity === 'toilets' || tags.toilets === 'yes' },
    { id: 'food', label: 'Café / restaurant', icon: '☕', matches: (tags) => ['cafe', 'restaurant', 'fast_food', 'food_court'].includes(tags.amenity) },
    { id: 'parking', label: 'Parking', icon: '🅿️', matches: (tags) => tags.amenity === 'parking' },
    { id: 'shop', label: 'Shop', icon: '🛒', matches: (tags) => Boolean(tags.shop) && !['mall', 'shopping_centre', 'department_store'].includes(tags.shop) },
    { id: 'wifi', label: 'Wi-Fi', icon: '📶', matches: (tags) => ['wlan', 'wifi', 'wireless', 'yes'].includes(String(tags.internet_access || '').toLowerCase()) },
    { id: 'waiting', label: 'Waiting area', icon: '🪑', matches: (tags) => ['bench', 'shelter', 'waiting_area'].includes(tags.amenity) || tags.waiting_area === 'yes' },
    { id: 'ac', label: 'Air conditioning', icon: '❄️', matches: (tags) => Object.entries(tags).some(([key, value]) => key.startsWith('air_conditioning') && ['yes', 'central', 'split', 'window'].includes(String(value).toLowerCase())) },
    { id: 'hotel', label: 'Hotel nearby', icon: '🏨', matches: (tags) => ['hotel', 'motel', 'hostel', 'guest_house'].includes(tags.tourism) },
    { id: 'mall', label: 'Shopping mall', icon: '🛍️', matches: (tags) => ['mall', 'shopping_centre', 'department_store'].includes(tags.shop) || tags.amenity === 'shopping_mall' },
  ];

  return definitions.map((definition) => {
    const places = uniqueElements.flatMap((element) => {
      const tags = element.tags || {};
      if (!definition.matches(tags)) return [];
      const point = element.type === 'node' ? element : element.center;
      if (!Number.isFinite(Number(point?.lat)) || !Number.isFinite(Number(point?.lon))) return [];
      const meters = Math.round(distanceInMeters(stationLat, stationLng, Number(point.lat), Number(point.lon)));
      return [{
        id: `${element.type}-${element.id}`,
        name: String(tags.name || tags.brand || tags.operator || `Mapped ${definition.label.toLowerCase()}`),
        distance_m: meters,
      }];
    }).sort((a, b) => a.distance_m - b.distance_m).slice(0, 4);

    return places.length ? { ...definition, places } : null;
  }).filter(Boolean);
}

function buildGeoapifyAmenityGroups(features, stationLat, stationLng) {
  const definitions = [
    { id: 'restroom', label: 'Restroom', icon: '🚻', matches: (categories) => categories.some((category) => category === 'amenity.toilet' || category.startsWith('amenity.toilet.')) },
    { id: 'food', label: 'Café / restaurant', icon: '☕', matches: (categories) => categories.some((category) => category.startsWith('catering.')) },
    { id: 'parking', label: 'Parking', icon: '🅿️', matches: (categories) => categories.some((category) => category === 'parking' || category.startsWith('parking.')) },
    { id: 'shop', label: 'Shop', icon: '🛒', matches: (categories) => categories.some((category) => category.startsWith('commercial.') && !['commercial.shopping_mall', 'commercial.department_store'].includes(category)) },
    { id: 'hotel', label: 'Hotel nearby', icon: '🏨', matches: (categories) => categories.some((category) => category.startsWith('accommodation.')) },
    { id: 'mall', label: 'Shopping mall', icon: '🛍️', matches: (categories) => categories.some((category) => ['commercial.shopping_mall', 'commercial.department_store'].includes(category)) },
  ];
  const places = features.map((feature) => {
    const properties = feature?.properties || {};
    const categories = Array.isArray(properties.categories) ? properties.categories : [];
    const latitude = Number(properties.lat ?? feature?.geometry?.coordinates?.[1]);
    const longitude = Number(properties.lon ?? feature?.geometry?.coordinates?.[0]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      categories,
      id: String(properties.place_id || feature.id || `${latitude},${longitude}`),
      name: String(properties.name || properties.address_line1 || properties.formatted || 'Nearby place'),
      distance_m: Number.isFinite(Number(properties.distance))
        ? Math.round(Number(properties.distance))
        : Math.round(distanceInMeters(stationLat, stationLng, latitude, longitude)),
    };
  }).filter(Boolean);

  return definitions.map((definition) => {
    const matchingPlaces = places
      .filter((place) => definition.matches(place.categories))
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, 4)
      .map(({ id, name, distance_m }) => ({ id, name, distance_m }));
    return matchingPlaces.length ? { ...definition, places: matchingPlaces } : null;
  }).filter(Boolean);
}

// Haversine distance in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const getStations = async (req, res) => {
  try {
    const { lat, lng, q, status, fastOnly } = req.query;
    const userLat = lat ? parseFloat(lat) : null;
    const userLng = lng ? parseFloat(lng) : null;
    const userId = req.user ? req.user.id : null;

    // Fetch stations with all their connectors
    const [allStationRows, connectorRows] = await Promise.all([db.list('stations'), db.list('connectors')]);
    const stationRows = allStationRows.filter((station) => station.is_active !== false);
    const connectorsByStation = new Map();
    for (const connector of connectorRows) {
      const group = connectorsByStation.get(Number(connector.station_id)) || [];
      group.push(connector);
      connectorsByStation.set(Number(connector.station_id), group);
    }
    let stations = stationRows.sort((a, b) => a.id - b.id).map((station) => {
      const connectors = connectorsByStation.get(Number(station.id)) || station.connectors || [];
      const hasAvailable = connectors.some(c => c && c.status === 'Available');
      const hasBusy = connectors.some(c => c && c.status === 'Busy');
      const hasFast = connectors.some(c => c && (c.current_type === 'DC' || c.power_kw >= 22));

      let computedStatus = 'Offline';
      if (hasAvailable) computedStatus = 'Available';
      else if (hasBusy) computedStatus = 'Busy';

      // Distance calculation
      let distanceKm = null;
      let distanceText = '';
      if (userLat !== null && userLng !== null) {
        distanceKm = calculateDistance(userLat, userLng, parseFloat(station.latitude), parseFloat(station.longitude));
        if (distanceKm < 1) {
          distanceText = `${Math.round(distanceKm * 1000)}m away`;
        } else {
          distanceText = `${distanceKm.toFixed(1)} km away`;
        }
      }

      return {
        ...station,
        latitude: parseFloat(station.latitude),
        longitude: parseFloat(station.longitude),
        rating: Number(station.community_rating || 0),
        total_reviews: Number(station.community_review_count || 0),
        computedStatus,
        hasAvailable,
        hasFast,
        distanceKm,
        distanceText,
        connectors
      };
    });

    // Check saved stations for logged in user
    if (userId) {
      const savedRows = await db.where('saved_stations', 'user_id', Number(userId));
      const savedSet = new Set(savedRows.map((row) => Number(row.station_id)));
      stations = stations.map(s => ({
        ...s,
        isSaved: savedSet.has(s.id)
      }));
    }

    // Apply Filters
    if (q) {
      const queryLower = q.toLowerCase();
      stations = stations.filter(s =>
        s.name.toLowerCase().includes(queryLower) ||
        s.address.toLowerCase().includes(queryLower) ||
        s.city.toLowerCase().includes(queryLower)
      );
    }

    if (status) {
      if (status.toLowerCase() === 'available') {
        stations = stations.filter(s => s.hasAvailable);
      } else if (status.toLowerCase() === 'busy') {
        stations = stations.filter(s => s.computedStatus === 'Busy');
      }
    }

    if (fastOnly === 'true' || fastOnly === true) {
      stations = stations.filter(s => s.hasFast);
    }

    // Sort by distance if coordinates provided
    if (userLat !== null && userLng !== null) {
      stations.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
    }

    return res.json({ stations });
  } catch (err) {
    console.error('Error fetching stations:', err);
    return res.status(500).json({ error: 'Failed to fetch charging stations' });
  }
};

export const getStationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null;

    const station = await db.get('stations', id);
    if (!station || station.is_active === false) {
      return res.status(404).json({ error: 'Station not found' });
    }
    const connectors = await db.where('connectors', 'station_id', Number(id));
    connectors.sort((a, b) => a.id - b.id);

    let isSaved = false;
    if (userId) {
      isSaved = Boolean((await db.where('saved_stations', 'user_id', Number(userId))).find((row) => Number(row.station_id) === Number(id)));
    }

    return res.json({
      station: {
        ...station,
        latitude: parseFloat(station.latitude),
        longitude: parseFloat(station.longitude),
        rating: Number(station.community_rating || 0),
        total_reviews: Number(station.community_review_count || 0),
        connectors,
        isSaved
      }
    });
  } catch (err) {
    console.error('Error getting station detail:', err);
    return res.status(500).json({ error: 'Failed to fetch station details' });
  }
};

export const getNearbyAmenities = async (req, res) => {
  let cacheKey = null;
  try {
    const station = await db.get('stations', req.params.id);
    if (!station || station.is_active === false) return res.status(404).json({ error: 'Station not found' });
    const latitude = Number(station.latitude);
    const longitude = Number(station.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(422).json({ error: 'This station does not have a valid map location' });
    }

    const geoapifyApiKey = process.env.GEOAPIFY_API_KEY?.trim();
    const provider = geoapifyApiKey ? 'Geoapify' : 'OpenStreetMap contributors';
    cacheKey = `${station.id}:${latitude.toFixed(5)}:${longitude.toFixed(5)}:${geoapifyApiKey ? 'geoapify' : 'overpass'}`;
    const cached = nearbyAmenitiesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return res.json(cached.data);

    let amenities;
    try {
      if (geoapifyApiKey) {
        const features = await fetchGeoapifyAmenities(latitude, longitude, geoapifyApiKey);
        amenities = buildGeoapifyAmenityGroups(features, latitude, longitude);
      } else {
        const query = `[out:json][timeout:10];(
          nwr(around:${AMENITIES_RADIUS_METERS},${latitude},${longitude})["amenity"~"^(toilets|cafe|restaurant|fast_food|food_court|parking|bench|shelter|waiting_area|shopping_mall)$"];
          nwr(around:${AMENITIES_RADIUS_METERS},${latitude},${longitude})["shop"~"^(convenience|supermarket|department_store|mall|shopping_centre|kiosk|bakery|general)$"];
          nwr(around:${AMENITIES_RADIUS_METERS},${latitude},${longitude})["tourism"~"^(hotel|motel|hostel|guest_house)$"];
        );out center tags;`;
        const payload = await fetchOverpassAmenities(query);
        amenities = buildNearbyAmenityGroups(payload.elements || [], latitude, longitude);
      }
    } catch (providerError) {
      console.error('Nearby amenities provider unavailable:', providerError);
      const lastGood = nearbyAmenitiesCache.get(cacheKey);
      if (lastGood && lastGood.staleUntil > Date.now()) {
        return res.json({ ...lastGood.data, stale: true });
      }
      return res.json({
        radius_m: AMENITIES_RADIUS_METERS,
        source: provider,
        amenities: [],
        unavailable: true,
      });
    }
    const data = {
      radius_m: AMENITIES_RADIUS_METERS,
      source: provider,
      amenities,
    };
    nearbyAmenitiesCache.set(cacheKey, {
      expiresAt: Date.now() + AMENITIES_CACHE_TTL_MS,
      staleUntil: Date.now() + AMENITIES_STALE_TTL_MS,
      data,
    });
    return res.json(data);
  } catch (err) {
    console.error('Fetch nearby station amenities error:', err);
    const cached = cacheKey ? nearbyAmenitiesCache.get(cacheKey) : null;
    if (cached && cached.staleUntil > Date.now()) {
      return res.json({ ...cached.data, stale: true });
    }
    return res.status(502).json({ error: 'Nearby place data is temporarily unavailable. Please try again.' });
  }
};

function publicReview(review, fallbackId) {
  return {
    id: review.review_id || fallbackId,
    author_name: review.author_name || 'ChargerHub driver',
    rating: Number(review.rating),
    comment: String(review.comment || ''),
    created_at: review.created_at,
    updated_at: review.updated_at,
  };
}

async function readStationReviews(station, userId = null) {
  const snapshot = await db.collection('station_reviews').where('station_id', '==', Number(station.id)).get();
  const documents = snapshot.docs.map((doc) => ({ ...doc.data(), _documentId: doc.id }));
  documents.sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
  const reviewCount = Number(station.community_review_count || 0);
  const rating = Number(station.community_rating || 0);
  const myReview = userId === null
    ? null
    : documents.find((review) => Number(review.user_id) === Number(userId));
  return {
    rating,
    total_reviews: reviewCount,
    myReview: myReview ? publicReview(myReview, myReview._documentId) : null,
    reviews: documents.slice(0, 50).map((review) => publicReview(review, review._documentId)),
  };
}

export const getStationReviews = async (req, res) => {
  try {
    const station = await db.get('stations', req.params.id);
    if (!station || station.is_active === false) return res.status(404).json({ error: 'Station not found' });
    return res.json(await readStationReviews(station, req.user?.id ?? null));
  } catch (err) {
    console.error('Get station reviews error:', err);
    return res.status(500).json({ error: 'Failed to fetch station reviews' });
  }
};

export const saveStationReview = async (req, res) => {
  try {
    const station = await db.get('stations', req.params.id);
    if (!station || station.is_active === false) return res.status(404).json({ error: 'Station not found' });

    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || '').trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Choose a rating from 1 to 5 stars' });
    }
    if (comment.length > 500) return res.status(400).json({ error: 'Review must be 500 characters or fewer' });

    const userId = Number(req.user.id);
    const reviewCollection = db.collection('station_reviews');
    const reviewRef = reviewCollection.doc(`${Number(station.id)}_${userId}`);
    const stationRef = db.collection('stations').doc(String(station.id));
    const stationReviewsQuery = reviewCollection.where('station_id', '==', Number(station.id));
    const now = new Date().toISOString();

    const result = await db.store().runTransaction(async (transaction) => {
      const [stationSnapshot, reviewSnapshot, reviewsSnapshot] = await Promise.all([
        transaction.get(stationRef),
        transaction.get(reviewRef),
        transaction.get(stationReviewsQuery),
      ]);
      if (!stationSnapshot.exists || stationSnapshot.data().is_active === false) return { missing: true };

      const stationData = stationSnapshot.data();
      const existingReview = reviewSnapshot.exists ? reviewSnapshot.data() : null;
      const storedSum = stationData.community_rating_sum;
      const storedCount = stationData.community_review_count;
      const previousReviews = reviewsSnapshot.docs.map((doc) => doc.data());
      const currentCount = Number.isFinite(Number(storedCount))
        ? Number(storedCount)
        : previousReviews.length;
      const currentSum = Number.isFinite(Number(storedSum))
        ? Number(storedSum)
        : previousReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
      const nextCount = currentCount + (existingReview ? 0 : 1);
      const nextSum = currentSum - Number(existingReview?.rating || 0) + rating;
      const average = Number((nextSum / nextCount).toFixed(1));
      const review = {
        id: reviewRef.id,
        review_id: existingReview?.review_id || randomUUID(),
        station_id: Number(station.id),
        user_id: userId,
        author_name: String(req.user.name || req.user.display_name || req.user.email?.split('@')[0] || 'ChargerHub driver').trim().slice(0, 80),
        rating,
        comment,
        created_at: existingReview?.created_at || now,
        updated_at: now,
      };

      transaction.set(reviewRef, review);
      transaction.set(stationRef, {
        community_rating_sum: nextSum,
        community_review_count: nextCount,
        community_rating: average,
        rating: average,
        total_reviews: nextCount,
        updated_at: now,
      }, { merge: true });
      return { review };
    });

    if (result.missing) return res.status(404).json({ error: 'Station not found' });
    const updatedStation = await db.get('stations', station.id);
    const reviewData = await readStationReviews(updatedStation, userId);
    return res.json({ message: 'Your station review was saved', ...reviewData });
  } catch (err) {
    console.error('Save station review error:', err);
    return res.status(500).json({ error: 'Failed to save station review' });
  }
};

export const deleteStationReview = async (req, res) => {
  try {
    const station = await db.get('stations', req.params.id);
    if (!station || station.is_active === false) return res.status(404).json({ error: 'Station not found' });

    const userId = Number(req.user.id);
    const reviewCollection = db.collection('station_reviews');
    const reviewRef = reviewCollection.doc(`${Number(station.id)}_${userId}`);
    const stationRef = db.collection('stations').doc(String(station.id));
    const stationReviewsQuery = reviewCollection.where('station_id', '==', Number(station.id));
    const result = await db.store().runTransaction(async (transaction) => {
      const [stationSnapshot, reviewSnapshot, reviewsSnapshot] = await Promise.all([
        transaction.get(stationRef),
        transaction.get(reviewRef),
        transaction.get(stationReviewsQuery),
      ]);
      if (!stationSnapshot.exists || stationSnapshot.data().is_active === false) return { missingStation: true };
      if (!reviewSnapshot.exists) return { missingReview: true };

      const stationData = stationSnapshot.data();
      const previousReviews = reviewsSnapshot.docs.map((doc) => doc.data());
      const storedCount = stationData.community_review_count;
      const storedSum = stationData.community_rating_sum;
      const currentCount = Number.isFinite(Number(storedCount)) ? Number(storedCount) : previousReviews.length;
      const currentSum = Number.isFinite(Number(storedSum))
        ? Number(storedSum)
        : previousReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
      const nextCount = Math.max(0, currentCount - 1);
      const nextSum = Math.max(0, currentSum - Number(reviewSnapshot.data().rating || 0));
      const average = nextCount ? Number((nextSum / nextCount).toFixed(1)) : 0;

      transaction.delete(reviewRef);
      transaction.set(stationRef, {
        community_rating_sum: nextSum,
        community_review_count: nextCount,
        community_rating: average,
        rating: average,
        total_reviews: nextCount,
        updated_at: new Date().toISOString(),
      }, { merge: true });
      return { deleted: true };
    });

    if (result.missingStation) return res.status(404).json({ error: 'Station not found' });
    if (result.missingReview) return res.status(404).json({ error: 'You do not have a review for this station' });
    const updatedStation = await db.get('stations', station.id);
    const reviewData = await readStationReviews(updatedStation, userId);
    return res.json({ message: 'Your station review was deleted', ...reviewData });
  } catch (err) {
    console.error('Delete station review error:', err);
    return res.status(500).json({ error: 'Failed to delete station review' });
  }
};

export const toggleSaveStation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existing = (await db.where('saved_stations', 'user_id', Number(userId))).find((row) => Number(row.station_id) === Number(id));

    if (existing) {
      await db.delete('saved_stations', existing.id);
      return res.json({ isSaved: false, message: 'Station removed from saved' });
    } else {
      await db.create('saved_stations', { user_id: userId, station_id: Number(id) });
      return res.json({ isSaved: true, message: 'Station saved successfully' });
    }
  } catch (err) {
    console.error('Error saving station:', err);
    return res.status(500).json({ error: 'Failed to update saved station' });
  }
};

export const getSavedStations = async (req, res) => {
  try {
    const userId = req.user.id;
    const savedRows = await db.where('saved_stations', 'user_id', Number(userId));
    savedRows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const savedStations = [];
    for (const saved of savedRows) {
      const station = await db.get('stations', saved.station_id);
      if (!station || station.is_active === false) continue;
      const connectors = await db.where('connectors', 'station_id', Number(station.id));
      savedStations.push({ ...station, connectors, isSaved: true });
    }
    return res.json({ savedStations });
  } catch (err) {
    console.error('Error fetching saved stations:', err);
    return res.status(500).json({ error: 'Failed to fetch saved stations' });
  }
};
