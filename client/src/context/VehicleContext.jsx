import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const VehicleContext = createContext(null);

export function VehicleProvider({ children }) {
  const { user, refreshUser } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const data = await api.get('/vehicles/catalog');
      if (!Array.isArray(data.catalog)) {
        throw new Error('The vehicle list could not be read.');
      }
      setCatalog(data.catalog);
    } catch (err) {
      console.error('Failed to load catalog:', err);
      setCatalog([]);
      setCatalogError(err.message || 'Could not load vehicle models.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const fetchVehicles = async () => {
    if (!user) {
      setVehicles([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.get('/vehicles');
      setVehicles(data.vehicles || []);
    } catch (err) {
      console.error('Failed to load user vehicles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  useEffect(() => {
    if (user) {
      fetchVehicles();
    } else {
      setVehicles([]);
    }
  }, [user]);

  const primaryVehicle = vehicles.find(v => v.is_primary) || vehicles[0] || null;

  const addVehicle = async (vehicleData) => {
    const res = await api.post('/vehicles', vehicleData);
    await fetchVehicles();
    await refreshUser();
    return res.vehicle;
  };

  const setPrimary = async (vehicleId) => {
    await api.put(`/vehicles/${vehicleId}/primary`);
    await fetchVehicles();
    await refreshUser();
  };

  const deleteVehicle = async (vehicleId) => {
    await api.delete(`/vehicles/${vehicleId}`);
    await fetchVehicles();
    await refreshUser();
  };

  return (
    <VehicleContext.Provider
      value={{
        vehicles,
        catalog,
        catalogLoading,
        catalogError,
        primaryVehicle,
        loading,
        addVehicle,
        setPrimary,
        deleteVehicle,
        refreshVehicles: fetchVehicles,
        refreshCatalog: fetchCatalog
      }}
    >
      {children}
    </VehicleContext.Provider>
  );
}

export const useVehicle = () => useContext(VehicleContext);
