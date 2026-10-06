import React from 'react';
import { ChevronDown, Car, Bike } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useVehicle } from '../context/VehicleContext.jsx';

export default function TopHeader({ onOpenVehicles, onOpenProfile, onOpenAdmin }) {
  const { user } = useAuth();
  const { primaryVehicle } = useVehicle();

  const isTwoWheeler = primaryVehicle?.type === '2-Wheeler';

  return (
    <header className="app-header">
      {/* Selected Vehicle Dropdown */}
      <button
        onClick={onOpenVehicles}
        type="button"
        style={{
          background: '#F1F4FA',
          border: '1px solid #E2E6F0',
          borderRadius: '24px',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <div style={{
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          background: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#151C38'
        }}>
          {isTwoWheeler ? <Bike size={16} /> : <Car size={16} />}
        </div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#151C38', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{primaryVehicle ? primaryVehicle.type : 'Select EV'}</span>
            <ChevronDown size={14} color="#717B9E" />
          </div>
          <div style={{ fontSize: '10px', color: '#68718B', fontWeight: 600 }}>
            {primaryVehicle ? primaryVehicle.registration_no : 'Add Vehicle'}
          </div>
        </div>
      </button>

      {/* Right Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {user?.role === 'admin' && (
          <button
            onClick={onOpenAdmin}
            style={{
              background: '#151C38',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '16px',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Admin
          </button>
        )}

        {/* User Initials Avatar */}
        <button
          onClick={onOpenProfile}
          type="button"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#E2E8F0',
            border: '2px solid #FFFFFF',
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#151C38',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
            overflow: 'hidden',
            padding: 0
          }}
        >
          {user?.avatar_url ? <img src={user.avatar_url} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : user?.avatar_initials || 'EV'}
        </button>
      </div>
    </header>
  );
}

