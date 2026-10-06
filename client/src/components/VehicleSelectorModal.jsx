import React from 'react';
import { X, Check, Plus, Trash2, BatteryCharging, Bike, Car } from 'lucide-react';
import { useVehicle } from '../context/VehicleContext.jsx';

export default function VehicleSelectorModal({ isOpen, onClose, onAddNew }) {
  const { vehicles, primaryVehicle, setPrimary, deleteVehicle } = useVehicle();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#151C38' }}>My EV Garage</h3>
            <p style={{ fontSize: '13px', color: '#68718B' }}>Select active vehicle or add a new one</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#F1F4FA', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={18} color="#151C38" />
          </button>
        </div>

        {/* Vehicles List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {vehicles.map((v) => {
            const isSelected = primaryVehicle?.id === v.id;
            const isTwo = v.type === '2-Wheeler';

            return (
              <div
                key={v.id}
                onClick={() => setPrimary(v.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: '16px',
                  border: isSelected ? '2px solid #00C896' : '1px solid #E2E6F0',
                  background: isSelected ? '#E0FBF4' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: isSelected ? '#00C896' : '#F1F4FA',
                    color: isSelected ? '#FFFFFF' : '#151C38',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {isTwo ? <Bike size={22} /> : <Car size={22} />}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#151C38' }}>{v.model}</h4>
                    <p style={{ fontSize: '12px', color: '#68718B', fontWeight: 600 }}>
                      {v.registration_no} • {v.battery_capacity_kwh} kWh • {v.connector_type}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '11px', color: '#10B981', fontWeight: 700 }}>
                      <BatteryCharging size={13} />
                      <span>{v.current_battery_pct}% Battery SoC</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isSelected ? (
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#00C896',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Check size={14} strokeWidth={3} />
                    </div>
                  ) : (
                    vehicles.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete ${v.model}?`)) deleteVehicle(v.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94A3B8',
                          padding: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => {
            onClose();
            onAddNew();
          }}
          className="btn-secondary"
          style={{ width: '100%', borderColor: '#00C896', color: '#00C896' }}
        >
          <Plus size={18} />
          <span>Add Another EV</span>
        </button>
      </div>
    </div>
  );
}
