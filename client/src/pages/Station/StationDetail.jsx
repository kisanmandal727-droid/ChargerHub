import React, { useEffect, useState } from 'react';
import { ArrowLeft, Star, Clock, Globe, Zap, Search, Bookmark, ShieldCheck, Share2, LoaderCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { api } from '../../api/client.js';

export default function StationDetail({ station, onBack, onSelectConnector, onReserveConnector }) {
  const [activeTab, setActiveTab] = useState('Charger');
  const [chargerSearch, setChargerSearch] = useState('');
  const [filterType, setFilterType] = useState('All'); // 'All' | 'Available' | 'AC' | 'DC'
  const [selectedConnectorId, setSelectedConnectorId] = useState(null);
  const [isSaved, setIsSaved] = useState(station?.isSaved || false);
  const [nearbyAmenities, setNearbyAmenities] = useState([]);
  const [amenitiesSource, setAmenitiesSource] = useState('OpenStreetMap contributors');
  const [amenitiesStale, setAmenitiesStale] = useState(false);
  const [amenitiesLoading, setAmenitiesLoading] = useState(false);
  const [amenitiesError, setAmenitiesError] = useState('');
  const [amenitiesUnavailable, setAmenitiesUnavailable] = useState(false);
  const [amenitiesRetry, setAmenitiesRetry] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState({
    rating: Number(station?.rating) || 0,
    total_reviews: Number(station?.total_reviews) || 0,
  });
  const [myReview, setMyReview] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsSaving, setReviewsSaving] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const [reviewRetry, setReviewRetry] = useState(0);

  const connectors = station?.connectors || [];
  const stationFacilities = Array.isArray(station?.amenities)
    ? station.amenities.map((amenity) => String(amenity || '').trim()).filter(Boolean)
    : [];
  const stationLatitude = Number(station?.latitude);
  const stationLongitude = Number(station?.longitude);
  const openStreetMapUrl = Number.isFinite(stationLatitude) && Number.isFinite(stationLongitude)
    ? `https://www.openstreetmap.org/?mlat=${stationLatitude}&mlon=${stationLongitude}#map=17/${stationLatitude}/${stationLongitude}`
    : 'https://www.openstreetmap.org';
  const displayedRating = Number(reviewStats.rating ?? station?.rating ?? 0);
  const displayedReviewCount = Number(reviewStats.total_reviews ?? station?.total_reviews ?? 0);

  useEffect(() => {
    if (activeTab !== 'Details' || !station?.id) return undefined;

    let cancelled = false;
    setAmenitiesLoading(true);
    setAmenitiesError('');
    setAmenitiesStale(false);
    setAmenitiesUnavailable(false);
    api.get(`/stations/${station.id}/amenities`)
      .then((result) => {
        if (!cancelled) {
          setNearbyAmenities(result.amenities || []);
          setAmenitiesSource(result.source || 'OpenStreetMap contributors');
          setAmenitiesStale(Boolean(result.stale));
          setAmenitiesUnavailable(Boolean(result.unavailable));
        }
      })
      .catch((error) => {
        if (!cancelled) setAmenitiesError(error.message || 'Nearby places could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setAmenitiesLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, station?.id, amenitiesRetry]);

  useEffect(() => {
    if (activeTab !== 'Reviews' || !station?.id) return undefined;

    let cancelled = false;
    setReviewsLoading(true);
    setReviewsError('');
    api.get(`/stations/${station.id}/reviews`)
      .then((result) => {
        if (cancelled) return;
        setReviews(result.reviews || []);
        setReviewStats({ rating: Number(result.rating) || 0, total_reviews: Number(result.total_reviews) || 0 });
        setMyReview(result.myReview || null);
        setReviewRating(Number(result.myReview?.rating) || 0);
        setReviewComment(result.myReview?.comment || '');
      })
      .catch((error) => {
        if (!cancelled) setReviewsError(error.message || 'Station reviews could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeTab, station?.id, reviewRetry]);

  const formatAmenityDistance = (meters) => meters < 1000
    ? `${meters} m`
    : `${(meters / 1000).toFixed(1)} km`;

  const handleSaveReview = async () => {
    if (!reviewRating) {
      setReviewsError('Choose a star rating before saving.');
      return;
    }
    setReviewsSaving(true);
    setReviewsError('');
    try {
      const result = await api.post(`/stations/${station.id}/reviews`, { rating: reviewRating, comment: reviewComment });
      setReviews(result.reviews || []);
      setReviewStats({ rating: Number(result.rating) || 0, total_reviews: Number(result.total_reviews) || 0 });
      setMyReview(result.myReview || null);
    } catch (error) {
      setReviewsError(error.message || 'Your review could not be saved.');
    } finally {
      setReviewsSaving(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!myReview || !window.confirm('Delete your rating and review for this station? The station score will be recalculated.')) return;
    setReviewsSaving(true);
    setReviewsError('');
    try {
      const result = await api.delete(`/stations/${station.id}/reviews`);
      setReviews(result.reviews || []);
      setReviewStats({ rating: Number(result.rating) || 0, total_reviews: Number(result.total_reviews) || 0 });
      setMyReview(null);
      setReviewRating(0);
      setReviewComment('');
    } catch (error) {
      setReviewsError(error.message || 'Your review could not be deleted.');
    } finally {
      setReviewsSaving(false);
    }
  };

  const handleToggleSave = async () => {
    try {
      const res = await api.post(`/stations/${station.id}/save`);
      setIsSaved(res.isSaved);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredConnectors = connectors.filter((c) => {
    if (chargerSearch && !c.charger_name.toLowerCase().includes(chargerSearch.toLowerCase())) {
      return false;
    }
    if (filterType === 'Available' && c.status !== 'Available') return false;
    if (filterType === 'AC' && c.current_type !== 'AC') return false;
    if (filterType === 'DC' && c.current_type !== 'DC') return false;
    return true;
  });

  const chosenConnector = connectors.find((c) => c.id === selectedConnectorId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', background: '#F8FAFC', position: 'relative' }}>
      {/* Top Bar Header */}
      <div style={{
        background: '#FFFFFF',
        padding: '16px 20px 12px',
        borderBottom: '1px solid #EAEFF6',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <button
            onClick={onBack}
            style={{ background: '#F1F4FA', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ArrowLeft size={20} color="#151C38" />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleToggleSave}
              style={{ background: '#F1F4FA', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Bookmark size={18} color={isSaved ? '#00C896' : '#717B9E'} fill={isSaved ? '#00C896' : 'none'} />
            </button>
            <div style={{
              background: '#F1F4FA',
              borderRadius: '20px',
              padding: '4px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 800,
              color: '#151C38'
            }}>
              <span>{displayedReviewCount ? displayedRating.toFixed(1) : 'New'}</span>
              <Star size={12} fill="#10B981" color="#10B981" />
              <span style={{ color: '#68718B', fontWeight: 600 }}>({displayedReviewCount})</span>
            </div>
          </div>
        </div>

        {/* Station Name & Mini Map Card */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: '#E2E8F0',
            overflow: 'hidden',
            flexShrink: 0,
            border: '1px solid #CBD5E1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#151C38',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '14px'
            }}>
              S
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '17px', fontWeight: 800, color: '#151C38', lineHeight: '1.25', marginBottom: '4px' }}>
              {station?.name}
            </h2>
            <p style={{ fontSize: '12px', color: '#68718B', lineHeight: '1.3' }}>
              {station?.address}
            </p>
          </div>
        </div>

        {/* Badges row matching screenshot: Open Now, 24 Hours, Public */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
          <span style={{ background: '#F1F4FA', color: '#151C38', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} color="#10B981" />
            <span>Open Now</span>
          </span>
          <span style={{ background: '#F1F4FA', color: '#151C38', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} color="#717B9E" />
            <span>24 Hours</span>
          </span>
          <span style={{ background: '#F1F4FA', color: '#151C38', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Globe size={12} color="#717B9E" />
            <span>Public</span>
          </span>
        </div>

        {/* Station tabs: Charger, Details, Reviews */}
        <div style={{ display: 'flex', borderBottom: '1px solid #EAEFF6', marginTop: '6px' }}>
          {['Charger', 'Details', 'Reviews'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                padding: '10px 0',
                fontSize: '14px',
                fontWeight: activeTab === tab ? 800 : 600,
                color: activeTab === tab ? '#151C38' : '#717B9E',
                cursor: 'pointer',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <span>{tab}</span>
              {activeTab === tab && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: '20%',
                  right: '20%',
                  height: '3px',
                  background: '#00C896',
                  borderRadius: '2px'
                }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'Charger' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 100px' }}>
          {/* Search & Filter Chips Bar matching screenshot */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', overflowX: 'auto', alignItems: 'center' }}>
            <div style={{
              flex: 1,
              minWidth: '160px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '6px 12px',
              border: '1px solid #E2E8F0'
            }}>
              <Search size={16} color="#94A3B8" />
              <input
                type="text"
                value={chargerSearch}
                onChange={(e) => setChargerSearch(e.target.value)}
                placeholder="Search Charger Name"
                style={{ border: 'none', outline: 'none', fontSize: '13px', width: '100%', color: '#151C38' }}
              />
            </div>

            {['Available', 'AC', 'DC'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterType(filterType === f ? 'All' : f)}
                style={{
                  background: filterType === f ? '#151C38' : '#FFFFFF',
                  color: filterType === f ? '#FFFFFF' : '#151C38',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Charger Cards matching reference screenshot! */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredConnectors.map((c) => {
              const isSelected = selectedConnectorId === c.id;
              const isAvail = c.status === 'Available';

              return (
                <div
                  key={c.id}
                  onClick={() => isAvail && setSelectedConnectorId(c.id)}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    padding: '16px',
                    border: isSelected ? '2px solid #00C896' : '1px solid #EAEFF6',
                    boxShadow: isSelected ? '0 4px 16px rgba(0, 200, 150, 0.2)' : '0 2px 8px rgba(0,0,0,0.02)',
                    cursor: isAvail ? 'pointer' : 'default',
                    opacity: isAvail ? 1 : 0.75,
                    transition: 'all 0.2s'
                  }}
                >
                  {/* Charger Card Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#151C38', marginBottom: '4px' }}>
                        {c.charger_name}
                      </h4>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ background: '#F1F4FA', color: '#151C38', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>
                          {c.current_type}
                        </span>
                        <span style={{ background: '#F1F4FA', color: '#151C38', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>
                          {c.power_kw}kW
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#151C38' }}>
                        ₹{c.price_per_kwh}/kWh
                      </span>
                      <p style={{ fontSize: '11px', color: '#68718B', marginTop: '4px' }}>
                        Last used: {c.last_used_minutes_ago || 24} mins ago
                      </p>
                    </div>
                  </div>

                  {/* Connector Row Inside Card matching screenshot */}
                  <div style={{
                    background: '#F8FAFC',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '8px',
                    border: '1px solid #EDF2F7'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#FFFFFF',
                        border: '1.5px solid #CBD5E1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Zap size={16} color="#00C896" />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>{c.connector_name}</div>
                        <div style={{ fontSize: '11px', color: '#68718B' }}>{c.connector_type}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`status-pill ${c.status === 'Available' ? 'available' : 'busy'}`}>
                        {c.status === 'Available' ? '✓ Available' : c.status}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#151C38' }}>
                        ⚡ Upto {c.power_kw}kW
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'Details' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#151C38', marginBottom: '4px' }}>Nearby amenities</h3>
              <p style={{ fontSize: '12px', color: '#68718B' }}>Mapped places within 800 m</p>
            </div>
            <button
              type="button"
              onClick={() => setAmenitiesRetry((attempt) => attempt + 1)}
              disabled={amenitiesLoading}
              aria-label="Refresh nearby amenities"
              title="Refresh nearby amenities"
              style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', width: '36px', height: '36px', display: 'grid', placeItems: 'center', color: '#151C38', cursor: amenitiesLoading ? 'wait' : 'pointer', flexShrink: 0 }}
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {amenitiesLoading ? (
            <div className="station-amenities-state"><LoaderCircle size={18} className="station-amenities-spinner" /> Finding nearby places…</div>
          ) : amenitiesError ? (
            <div className="station-amenities-state station-amenities-error" role="alert">
              <span>{amenitiesError}</span>
              <button type="button" onClick={() => setAmenitiesRetry((attempt) => attempt + 1)}>Try again</button>
            </div>
          ) : amenitiesUnavailable ? (
            <div className="station-amenities-state">
              Live nearby-place data is not responding right now. Station-listed facilities and the area map are available below.
            </div>
          ) : (
            <>
              {amenitiesStale && <div className="station-amenities-state">Showing saved nearby-place data while live data is temporarily unavailable.</div>}
              {nearbyAmenities.length ? (
                <div className="station-amenities-grid">
                  {nearbyAmenities.map((amenity) => (
                    <section className="station-amenity-card" key={amenity.id}>
                      <h4><span aria-hidden="true">{amenity.icon}</span>{amenity.label}</h4>
                      <ul>
                        {amenity.places.map((place) => (
                          <li key={place.id}>
                            <span>{place.name}</span>
                            <small>{formatAmenityDistance(place.distance_m)}</small>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="station-amenities-state">
                  {amenitiesStale
                    ? 'No nearby amenities were listed in the saved map data.'
                    : 'No nearby amenities were found in the mapped data within 800 m.'}
                </div>
              )}
            </>
          )}

          {!amenitiesLoading && (amenitiesError || amenitiesUnavailable || nearbyAmenities.length === 0) && stationFacilities.length > 0 && (
            <div className="station-listed-amenities">
              <strong>Facilities listed for this station</strong>
              <div>
                {stationFacilities.map((facility, index) => <span key={`${facility}-${index}`}>{facility}</span>)}
              </div>
            </div>
          )}

          <a className="station-amenities-map-link" href={openStreetMapUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> View this area on OpenStreetMap
          </a>

          <p className="station-amenities-attribution">
            {amenitiesSource === 'Geoapify' ? (
              <>Nearby places powered by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a>; data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Map coverage may be incomplete; confirm access and opening hours at the location.</>
            ) : (
              <>Nearby-place data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Map coverage may be incomplete; confirm access and opening hours at the location.</>
            )}
          </p>
        </div>
      )}

      {activeTab === 'Reviews' && (
        <div className="station-reviews-content">
          <div className="station-reviews-summary">
            <strong>{displayedReviewCount ? displayedRating.toFixed(1) : '—'}</strong>
            <div>
              <div className="station-review-stars" aria-label={`${displayedReviewCount ? displayedRating.toFixed(1) : 'No'} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} size={16} fill={star <= Math.round(displayedRating) ? '#F59E0B' : 'none'} color="#F59E0B" />
                ))}
              </div>
              <span>{displayedReviewCount ? `Based on ${displayedReviewCount} user ${displayedReviewCount === 1 ? 'review' : 'reviews'}` : 'No ratings yet. Be the first to review this station.'}</span>
            </div>
          </div>

          <section className="station-review-composer">
            <h3>{myReview ? 'Update your review' : 'Rate this station'}</h3>
            <p>How was your charging experience?</p>
            <div className="station-review-rating-picker" role="group" aria-label="Choose a rating from 1 to 5 stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                  aria-pressed={reviewRating === star}
                >
                  <Star size={26} fill={star <= reviewRating ? '#F59E0B' : 'none'} color="#F59E0B" />
                </button>
              ))}
            </div>
            <textarea
              value={reviewComment}
              onChange={(event) => setReviewComment(event.target.value.slice(0, 500))}
              placeholder="Share details about the charger, access, or your visit (optional)"
              rows={3}
              maxLength={500}
            />
            <div className="station-review-composer-footer">
              <small>{reviewComment.length}/500</small>
              <div className="station-review-composer-actions">
                {myReview && (
                  <button type="button" className="station-review-delete" onClick={handleDeleteReview} disabled={reviewsSaving}>
                    Delete review
                  </button>
                )}
                <button type="button" onClick={handleSaveReview} disabled={reviewsSaving || !reviewRating}>
                  {reviewsSaving ? 'Saving…' : myReview ? 'Update review' : 'Submit review'}
                </button>
              </div>
            </div>
          </section>

          {reviewsError && (
            <div className="station-reviews-error" role="alert">
              <span>{reviewsError}</span>
              <button type="button" onClick={() => setReviewRetry((attempt) => attempt + 1)}>Reload reviews</button>
            </div>
          )}

          <h3 className="station-review-list-heading">Driver reviews</h3>
          {reviewsLoading ? (
            <div className="station-reviews-empty"><LoaderCircle size={18} className="station-amenities-spinner" /> Loading reviews…</div>
          ) : reviews.length ? (
            <div className="station-review-list">
              {reviews.map((review) => (
                <article key={review.id} className="station-review-card">
                  <div className="station-review-card-header">
                    <div>
                      <strong>{review.author_name}</strong>
                      <div className="station-review-stars" aria-label={`${review.rating} out of 5 stars`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star key={star} size={13} fill={star <= review.rating ? '#F59E0B' : 'none'} color="#F59E0B" />
                        ))}
                      </div>
                    </div>
                    <time dateTime={review.updated_at || review.created_at}>
                      {new Date(review.updated_at || review.created_at).toLocaleDateString()}
                    </time>
                  </div>
                  {review.comment && <p>{review.comment}</p>}
                  {myReview?.id === review.id && <span className="station-review-yours">Your review</span>}
                </article>
              ))}
            </div>
          ) : !reviewsError ? (
            <div className="station-reviews-empty">No written reviews yet. Your rating helps other drivers choose a charger.</div>
          ) : null}
        </div>
      )}

      {/* Fixed Bottom Button matching screenshot: "Select a connector" */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#FFFFFF',
        borderTop: '1px solid #F1F4FA',
        padding: '14px 20px',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
        display: 'flex',
        gap: '10px'
      }}>
        <button
          type="button"
          onClick={() => {
            if (!selectedConnectorId && filteredConnectors.length > 0) {
              setSelectedConnectorId(filteredConnectors[0].id);
              onSelectConnector(filteredConnectors[0]);
            } else if (chosenConnector) {
              onSelectConnector(chosenConnector);
            }
          }}
          className="btn-primary"
          style={{ flex: 2, background: '#00C896' }}
        >
          {selectedConnectorId ? 'Start Charging' : 'Select a connector'}
        </button>

        {selectedConnectorId && (
          <button
            type="button"
            onClick={() => chosenConnector && onReserveConnector(chosenConnector)}
            className="btn-secondary"
            style={{ flex: 1 }}
          >
            Reserve Slot
          </button>
        )}
      </div>
    </div>
  );
}
