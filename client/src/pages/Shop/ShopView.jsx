import React from 'react';
import { Clock, ShoppingBag } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ShopView() {
  const { user } = useAuth();
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="shop-coming-soon-view">
      <header className="shop-coming-soon-header">
        <p>{firstName ? `Good morning, ${firstName}` : 'ChargerHub Shop'}</p>
        <h2>Explore ChargerHub Shop</h2>
      </header>

      <main className="shop-coming-soon-main">
        <section className="shop-coming-soon-card" aria-labelledby="shop-coming-soon-title">
          <div className="shop-coming-soon-icon"><ShoppingBag size={31} /></div>
          <span className="shop-coming-soon-label"><Clock size={14} /> Coming soon</span>
          <h3 id="shop-coming-soon-title">Nothing available right now</h3>
          <p>We’re getting the ChargerHub Shop ready. Please check back soon.</p>
        </section>
      </main>
    </div>
  );
}
