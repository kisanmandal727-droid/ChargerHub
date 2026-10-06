import React, { createContext, useContext, useState, useEffect } from 'react';

const LocationContext = createContext(null);

// A city-level preview keeps the map usable until the user grants location access.
const DEFAULT_LOCATION = {
  lat: 18.5204,
  lng: 73.8567,
  label: 'Pune map preview'
};

export function LocationProvider({ children }) {
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [hasPermission, setHasPermission] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);

  const requestLiveLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLocating(false);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: 'Current Location'
        });
        setHasPermission(true);
        setLocating(false);
        setError(null);
      },
      (err) => {
        console.warn('Geolocation denied or unavailable:', err.message);
        setLocating(false);
        setError(err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  useEffect(() => {
    // Attempt detecting location on mount
    requestLiveLocation();
  }, []);

  return (
    <LocationContext.Provider
      value={{
        location,
        hasPermission,
        locating,
        error,
        requestLiveLocation,
        setLocation
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export const useLocation = () => useContext(LocationContext);
