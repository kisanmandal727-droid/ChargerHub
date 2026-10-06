import React, { useState } from 'react';
import { Search, Check, ArrowLeft, X } from 'lucide-react';
import { useVehicle } from '../../context/VehicleContext.jsx';

const normalizeRegistrationNumber = (value) => value.trim().toUpperCase().replace(/[\s-]+/g, '');
const isValidIndianRegistrationNumber = (value) => /^(?:[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}|[A-Z]{2}\d{1,2}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(value);
const getCapacityLabel = (vehicle) => vehicle.battery_capacity_kwh == null
  ? 'Capacity to confirm'
  : `${vehicle.capacity_is_estimate ? '≈ ' : ''}${vehicle.battery_capacity_kwh} kWh`;

export default function VehicleSetup({ onComplete, isModal = false, onClose }) {
  const { catalog, catalogLoading, catalogError, refreshCatalog, addVehicle } = useVehicle();

  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState(null);
  const [showRegModal, setShowRegModal] = useState(false);
  const [regNumber, setRegNumber] = useState('');
  const [batteryCapacityOverride, setBatteryCapacityOverride] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const tabs = ['All', '4-Wheeler', '2-Wheeler', '3-Wheeler'];

  const filteredCatalog = catalog.filter((item) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = item.model.toLowerCase().includes(query) ||
                          item.brand.toLowerCase().includes(query) ||
                          String(item.variant || '').toLowerCase().includes(query);
    if (!matchesSearch) return false;

    if (activeTab === 'All') return true;
    return item.type === activeTab;
  });

  const handleCardClick = (model) => {
    setSelectedModel(model);
    setRegNumber('');
    setBatteryCapacityOverride('');
    setErrorMsg('');
    setShowRegModal(true);
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    const cleanReg = normalizeRegistrationNumber(regNumber);
    if (!cleanReg) {
      setErrorMsg('Please enter your vehicle registration number');
      return;
    }
    if (!isValidIndianRegistrationNumber(cleanReg)) {
      setErrorMsg('Enter a valid Indian number format, such as MH12AB1234 or 24BH1234AA');
      return;
    }
    if (!selectedModel) {
      setErrorMsg('Please select a vehicle model first');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await addVehicle({
        catalog_id: selectedModel.id,
        type: selectedModel.type,
        brand: selectedModel.brand,
        model: selectedModel.model,
        variant: selectedModel.variant,
        registration_no: cleanReg,
        battery_capacity_kwh: (selectedModel.battery_capacity_kwh == null || selectedModel.capacity_is_estimate)
          ? Number(batteryCapacityOverride)
          : selectedModel.battery_capacity_kwh,
        connector_type: selectedModel.connector_type,
        current_battery_pct: 65,
        image_url: selectedModel.image_url
      });

      setShowRegModal(false);
      if (onComplete) onComplete();
      if (onClose) onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to register vehicle');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#FFFFFF',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Top Header */}
      <div style={{
        padding: '16px 20px 8px',
        borderBottom: '1px solid #F1F4FA',
        background: '#FFFFFF',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          {isModal && (
            <button
              onClick={onClose}
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
            >
              <ArrowLeft size={22} color="#151C38" />
            </button>
          )}
          <h2 style={{
            fontSize: '18px',
            fontWeight: 800,
            color: '#151C38',
            flex: 1,
            textAlign: 'center'
          }}>
            Select your vehicle
          </h2>
          {isModal && <div style={{ width: '26px' }} />}
        </div>

        {/* Brand Tabs with Orange underline matching screenshot */}
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          gap: '20px',
          paddingBottom: '2px'
        }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 4px 10px',
                  fontSize: '14px',
                  fontWeight: isActive ? 800 : 600,
                  color: isActive ? '#151C38' : '#717B9E',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                  transition: 'all 0.2s'
                }}
              >
                {tab}
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    background: '#00C896',
                    borderRadius: '2px'
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Bar matching screenshot */}
      <div style={{ padding: '12px 20px 8px' }}>
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center'
        }}>
          <Search size={18} color="#94A3B8" style={{ position: 'absolute', left: '14px' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for vehicle"
            style={{
              width: '100%',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '12px 14px 12px 42px',
              fontSize: '14px',
              color: '#151C38',
              outline: 'none',
              fontWeight: 500
            }}
          />
        </div>
      </div>

      <p style={{ margin: '0 20px', fontSize: '11px', color: '#68718B' }}>
        Battery figures marked ≈ are estimates. Confirm the exact battery pack and connector for your variant.
      </p>

      {/* Grid of Vehicle Cards matching screenshot */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 20px 90px',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        alignContent: 'start'
      }}>
        {catalogLoading && (
          <div style={{ gridColumn: '1 / -1', padding: '36px 16px', textAlign: 'center', color: '#68718B', fontWeight: 600 }}>
            Loading vehicle models…
          </div>
        )}
        {!catalogLoading && catalogError && (
          <div style={{ gridColumn: '1 / -1', padding: '28px 16px', textAlign: 'center', color: '#68718B' }}>
            <p style={{ margin: '0 0 14px', fontWeight: 600 }}>
              We couldn’t load vehicle models. Check that the ChargerHub server is running, then try again.
            </p>
            <button
              type="button"
              onClick={refreshCatalog}
              style={{ border: 0, borderRadius: 10, padding: '10px 16px', background: '#E8FBF5', color: '#087F63', fontWeight: 700, cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        )}
        {!catalogLoading && !catalogError && filteredCatalog.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '36px 16px', textAlign: 'center', color: '#68718B', fontWeight: 600 }}>
            {catalog.length > 0 ? 'No models match your search. Try another search or choose All.' : 'No vehicle models are available right now. Please try again shortly.'}
          </div>
        )}
        {filteredCatalog.map((item) => {
          const isSelected = selectedModel?.id === item.id;
          return (
            <div
              key={item.id}
              onClick={() => handleCardClick(item)}
              style={{
                background: '#FFFFFF',
                border: isSelected ? '2px solid #00C896' : '1px solid #EAEFF6',
                borderRadius: '18px',
                padding: '18px 10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: isSelected ? '0 4px 16px rgba(0, 200, 150, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.03)',
                transition: 'all 0.2s',
                position: 'relative'
              }}
            >
              {isSelected && (
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#00C896',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Check size={12} strokeWidth={3} />
                </div>
              )}

              <div style={{ fontSize: '10px', color: '#68718B', fontWeight: 700, marginBottom: '3px' }}>{item.brand}</div>
              <h4 style={{
                fontSize: '13px',
                fontWeight: 800,
                color: '#151C38',
                marginBottom: '4px',
                lineHeight: '1.2'
              }}>
                {item.model}
              </h4>

              <span style={{
                fontSize: '11px',
                color: '#68718B',
                fontWeight: 600,
                lineHeight: 1.35
              }}>
                {item.variant} • {getCapacityLabel(item)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Fixed Bottom "Add Vehicle" Button matching screenshot */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#FFFFFF',
        borderTop: '1px solid #F1F4FA',
        padding: '14px 20px',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.06)'
      }}>
        <button
          type="button"
          onClick={() => {
            const modelToRegister = filteredCatalog.find((item) => item.id === selectedModel?.id) || filteredCatalog[0];
            if (!modelToRegister) return;
            handleCardClick(modelToRegister);
          }}
          disabled={catalogLoading || Boolean(catalogError) || filteredCatalog.length === 0}
          className="btn-primary"
          style={{
            background: '#00C896',
            opacity: catalogLoading || catalogError || filteredCatalog.length === 0 ? 0.55 : 1,
            cursor: catalogLoading || catalogError || filteredCatalog.length === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          {catalogLoading ? 'Loading models…' : catalogError ? 'Models unavailable' : 'Add Vehicle'}
        </button>
      </div>

      {/* Bottom Sheet Modal: "Enter your Vehicle Number" matching screenshot */}
      {showRegModal && selectedModel && (
        <div className="modal-overlay" onClick={() => setShowRegModal(false)}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#151C38' }}>
                Enter your Vehicle Number
              </h3>
              <button
                onClick={() => setShowRegModal(false)}
                style={{ background: '#F1F4FA', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <X size={18} color="#151C38" />
              </button>
            </div>

            {selectedModel && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: '#F8FAFC',
                padding: '10px 14px',
                borderRadius: '14px',
                marginBottom: '18px',
                border: '1px solid #E2E8F0'
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>{selectedModel.model}</div>
                  <div style={{ fontSize: '11px', color: '#68718B' }}>{selectedModel.brand} • {selectedModel.variant} • {getCapacityLabel(selectedModel)}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit}>
              {(selectedModel.battery_capacity_kwh == null || selectedModel.capacity_is_estimate) && (
                <div className="input-group" style={{ marginBottom: '12px' }}>
                  <span className="floating-label">Confirm battery capacity (kWh)</span>
                  <input
                    type="number"
                    value={batteryCapacityOverride}
                    onChange={(e) => setBatteryCapacityOverride(e.target.value)}
                    className="input-field"
                    placeholder="Enter exact capacity for your trim"
                    min="0.1"
                    step="0.1"
                    required
                  />
                  <small style={{ display: 'block', color: '#68718B', marginTop: '6px' }}>
                    {selectedModel.capacity_note || `This list shows an estimate (${getCapacityLabel(selectedModel)}). Enter the exact pack size for your trim.`}
                  </small>
                </div>
              )}
              <div className="input-group" style={{ marginBottom: '6px' }}>
                <span className="floating-label">Vehicle Number</span>
                <input
                  type="text"
                  value={regNumber}
                  onChange={(e) => {
                    setRegNumber(e.target.value.toUpperCase());
                    setErrorMsg('');
                  }}
                  className="input-field"
                  placeholder="e.g. MH12XB2903"
                  autoCapitalize="characters"
                  maxLength={20}
                  autoFocus
                  required
                />
              </div>

              <p style={{ fontSize: '12px', color: '#68718B', marginBottom: '22px', fontWeight: 500 }}>
                {regNumber.trim()
                  ? (isValidIndianRegistrationNumber(normalizeRegistrationNumber(regNumber))
                    ? 'Number format looks valid. The app does not check live RTO records.'
                    : 'Check the format. Example: MH12AB1234 or 24BH1234AA.')
                  : `Enter your ${selectedModel?.type || 'vehicle'} registration number. Format check only; live RTO records are not checked.`}
              </p>

              {errorMsg && (
                <p style={{ color: '#EF4444', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !isValidIndianRegistrationNumber(normalizeRegistrationNumber(regNumber)) || ((selectedModel.battery_capacity_kwh == null || selectedModel.capacity_is_estimate) && !(Number(batteryCapacityOverride) > 0))}
                className="btn-primary"
                style={{ marginBottom: '16px', opacity: submitting ? 0.65 : 1 }}
              >
                {submitting ? 'Registering...' : 'Submit'}
              </button>

              {/* Exact quote from reference screenshot */}
              <p style={{
                textAlign: 'center',
                fontSize: '12px',
                color: '#68718B',
                fontStyle: 'normal',
                lineHeight: '1.4'
              }}>
                "Just once! Register your vehicle now, and we'll remember it for you."
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
