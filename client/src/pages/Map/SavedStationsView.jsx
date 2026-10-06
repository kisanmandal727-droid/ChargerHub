import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, ChevronRight, MapPin, PlugZap } from 'lucide-react';
import { api } from '../../api/client.js';

function stationAvailability(connectors = []) {
  if (connectors.some((connector) => String(connector.status).toLowerCase() === 'available')) return 'Available';
  if (connectors.some((connector) => String(connector.status).toLowerCase() === 'busy')) return 'Busy';
  return 'Offline';
}

export default function SavedStationsView({ onBack, onSelectStation }) {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSavedStations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/stations/saved');
      setStations(response.savedStations || []);
    } catch (err) {
      setError(err.message || 'Saved stations could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSavedStations(); }, [loadSavedStations]);

  return (
    <section className="saved-stations-view">
      <header className="saved-stations-header">
        <button type="button" className="saved-stations-back" onClick={onBack} aria-label="Back to profile">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>Saved stations</h1>
          <p>Your bookmarked charging locations</p>
        </div>
        <span className="saved-stations-count">{stations.length}</span>
      </header>

      <main className="saved-stations-content">
        {loading ? (
          <div className="saved-stations-state" role="status">Loading your saved stations…</div>
        ) : error ? (
          <div className="saved-stations-state is-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={loadSavedStations}>Try again</button>
          </div>
        ) : stations.length === 0 ? (
          <div className="saved-stations-state saved-stations-empty">
            <Bookmark size={30} />
            <strong>No saved stations yet</strong>
            <p>Open a station from the map and tap Save to keep it here.</p>
            <button type="button" onClick={onBack}>Back to profile</button>
          </div>
        ) : (
          <div className="saved-stations-grid">
            {stations.map((station) => {
              const connectors = station.connectors || [];
              const availability = stationAvailability(connectors);
              return (
                <button
                  key={station.id}
                  type="button"
                  className="saved-station-card"
                  onClick={() => onSelectStation(station)}
                  aria-label={`Open ${station.name}`}
                >
                  <span className="saved-station-heading">
                    <span className="saved-station-icon"><Bookmark size={18} fill="currentColor" /></span>
                    <span className="saved-station-title">
                      <strong>{station.name}</strong>
                      <span><MapPin size={14} /> {station.address || station.city || 'Address unavailable'}</span>
                    </span>
                    <ChevronRight size={19} className="saved-station-chevron" />
                  </span>
                  <span className="saved-station-meta">
                    <span className={`saved-station-status ${availability.toLowerCase()}`}>{availability}</span>
                    <span><PlugZap size={15} /> {connectors.length} connector{connectors.length === 1 ? '' : 's'}</span>
                  </span>
                  {connectors.length > 0 && (
                    <span className="saved-station-connector-list">
                      {connectors.slice(0, 3).map((connector, index) => (
                        <span key={connector.id || `${connector.charger_name}-${index}`}>
                          {connector.connector_type || connector.charger_name || 'Connector'}
                          {connector.power_kw ? ` · ${connector.power_kw} kW` : ''}
                        </span>
                      ))}
                      {connectors.length > 3 && <span>+{connectors.length - 3} more</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </main>
    </section>
  );
}
