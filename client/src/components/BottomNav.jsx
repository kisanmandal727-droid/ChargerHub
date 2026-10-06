import React from 'react';
import { MapPin, Wallet, ShoppingBag, Radio, Route } from 'lucide-react';

export default function BottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'shop', label: 'Shop', icon: ShoppingBag },
    { id: 'buzz', label: 'Buzz', icon: Radio },
    { id: 'trips', label: 'Trips', icon: Route }
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            <div className="nav-icon-wrapper" style={{ position: 'relative' }}>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} color={isActive ? '#151C38' : '#717B9E'} />
              {tab.badge && <span className="badge-tag">{tab.badge}</span>}
            </div>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
