import React, { useState, useEffect } from 'react';
import { Zap, Clock, IndianRupee, BatteryCharging, CheckCircle, AlertTriangle, ShieldCheck, Power } from 'lucide-react';
import { api, getWebSocketUrl } from '../../api/client.js';
import { useWallet } from '../../context/WalletContext.jsx';
import { useVehicle } from '../../context/VehicleContext.jsx';

export default function ActiveCharging({ initialSession, onSessionFinished, onViewHistory }) {
  const { refreshWallet } = useWallet();
  const { refreshVehicles } = useVehicle();

  const [session, setSession] = useState(initialSession);
  const [stopping, setStopping] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [displayNow, setDisplayNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setDisplayNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll for telemetry & active session status
  useEffect(() => {
    let interval = null;

    const pollSession = async () => {
      try {
        const res = await api.get('/charging/active');
        if (res.activeSession) {
          setSession(res.activeSession);
          if (res.activeSession.status === 'completed') {
            handleCompleteState(res.activeSession);
          }
        }
      } catch (err) {
        console.error('Session poll error:', err);
      }
    };

    interval = setInterval(pollSession, 60000);
    return () => clearInterval(interval);
  }, []);

  // Connect WebSocket for instant telemetry pushes
  useEffect(() => {
    let ws = null;

    try {
      ws = new WebSocket(getWebSocketUrl());
      ws.onopen = () => {
        if (session?.id) {
          ws.send(JSON.stringify({ type: 'SUBSCRIBE_SESSION', sessionId: session.id }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'CHARGING_TELEMETRY' && data.sessionId === session?.id) {
            setSession((prev) => ({
              ...prev,
              current_soc_pct: data.current_soc_pct,
              energy_delivered_kwh: data.energy_delivered_kwh,
              total_cost: data.total_cost,
              power_kw: data.power_kw,
              status: data.status
            }));

            if (data.status === 'completed') {
              handleCompleteState({
                ...session,
                current_soc_pct: data.current_soc_pct,
                energy_delivered_kwh: data.energy_delivered_kwh,
                total_cost: data.total_cost
              });
            }
          }
        } catch (e) {}
      };
    } catch (e) {
      console.warn('WS fallback to polling');
    }

    return () => {
      if (ws) ws.close();
    };
  }, [session?.id]);

  const handleCompleteState = (finalSession) => {
    setReceiptData({
      energyKwh: finalSession.energy_delivered_kwh,
      totalCost: finalSession.total_cost,
      finalSoc: finalSession.current_soc_pct,
      greenKm: (parseFloat(finalSession.energy_delivered_kwh) * 7.2).toFixed(1)
    });
    setShowReceipt(true);
    refreshWallet();
    refreshVehicles();
  };

  const handleStopCharging = async () => {
    if (!confirm('Are you sure you want to stop charging?')) return;
    setStopping(true);
    try {
      const res = await api.post(`/charging/${session.id}/stop`, {
        final_soc_pct: soc,
        energy_kwh: energyValue,
        final_cost: Number(cost)
      });

      setReceiptData({
        energyKwh: res.session.energy_delivered_kwh,
        totalCost: res.session.total_cost,
        finalSoc: res.session.current_soc_pct,
        greenKm: res.greenKmAdded
      });
      setShowReceipt(true);
      await refreshWallet();
      await refreshVehicles();
    } catch (err) {
      alert(err.message || 'Failed to stop session');
    } finally {
      setStopping(false);
    }
  };

  const startSoc = Number(session?.start_soc_pct ?? session?.current_soc_pct ?? 45);
  const targetSoc = Number(session?.target_soc_pct ?? 80);
  const power = Number(session?.power_kw || session?.connector_power || 3.3);
  const capacity = Number(session?.battery_capacity_kwh || session?.battery_capacity || 30);
  const targetEnergy = Number(session?.target_energy_kwh || (Math.max(0, targetSoc - startSoc) / 100 * capacity));
  const savedEnergy = Number(session?.energy_delivered_kwh || 0);
  const startedAt = Date.parse(session?.started_at || '');
  const simulatedElapsedSeconds = Number.isFinite(startedAt) ? Math.max(0, (displayNow - startedAt) / 1000) * 10 : 0;
  const projectedEnergy = session?.status === 'charging' && Number.isFinite(startedAt)
    ? Math.min(targetEnergy, simulatedElapsedSeconds / 3600 * power * 0.9)
    : savedEnergy;
  const energyCeiling = targetEnergy > 0 ? targetEnergy : Number.POSITIVE_INFINITY;
  const energyValue = Math.min(energyCeiling, Math.max(savedEnergy, projectedEnergy));
  const energy = energyValue.toFixed(2);
  const projectedSoc = Math.min(targetSoc, Number((startSoc + energyValue / capacity * 100).toFixed(1)));
  const soc = session?.status === 'charging' ? projectedSoc : Number(session?.current_soc_pct ?? startSoc);
  const unitPrice = Number(session?.unit_price || session?.price_per_kwh || 15);
  const projectedCost = energyValue * unitPrice * 1.18;
  const cost = (String(session?.charge_type).toLowerCase() === 'amount'
    ? Math.min(projectedCost, Number(session?.target_value || projectedCost))
    : projectedCost).toFixed(2);
  const progress = targetEnergy > 0 ? Math.min(100, Math.max(0, energyValue / targetEnergy * 100)) : 0;
  const targetValue = Number(session?.target_value || 0);
  const goalLabel = session?.charge_type === 'Amount'
    ? '₹' + targetValue.toFixed(0)
    : session?.charge_type === 'Units'
      ? targetValue + ' kWh'
      : session?.charge_type === 'Time'
        ? targetValue + ' min'
        : targetValue + '%';

  // Circular gauge calculations (radius 100)
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0E1326',
      color: '#FFFFFF',
      position: 'relative'
    }}>
      {/* Top Header */}
      <div style={{
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div>
          <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
            ● CHARGING IN PROGRESS
          </span>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#FFFFFF', marginTop: '2px' }}>
            {session?.charger_name || 'Smart Charger'}
          </h2>
        </div>
        <div style={{
          background: 'rgba(0, 200, 150, 0.15)',
          border: '1px solid #00C896',
          borderRadius: '20px',
          padding: '4px 12px',
          fontSize: '12px',
          fontWeight: 800,
          color: '#00C896'
        }}>
          {power} kW Speed
        </div>
      </div>

      {/* Main Gauge View */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 20px 100px'
      }}>
        {/* Animated Circular Gauge */}
        <div style={{ position: 'relative', width: '240px', height: '240px', marginBottom: '32px' }}>
          <svg width="240" height="240" viewBox="0 0 240 240">
            {/* Background Ring */}
            <circle
              cx="120"
              cy="120"
              r={radius}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="14"
              fill="transparent"
            />
            {/* Progress Active Ring */}
            <circle
              cx="120"
              cy="120"
              r={radius}
              stroke="#00C896"
              strokeWidth="14"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="charging-gauge-circle"
            />
          </svg>

            {/* Charging goal progress */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <BatteryCharging size={28} color="#00C896" style={{ marginBottom: '4px' }} />
            <div style={{ fontSize: '48px', fontWeight: 900, color: '#FFFFFF', lineHeight: '1' }}>
              {progress.toFixed(0)}%
            </div>
            <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600, marginTop: '4px' }}>
              of {goalLabel}
            </div>
          </div>
        </div>
        <div style={{ marginTop: '-20px', marginBottom: '22px', color: '#94A3B8', fontSize: '13px', fontWeight: 700 }}>
          Battery: {startSoc}% → {soc}% (goal {targetSoc}%)
        </div>

        {/* Live Telemetry Metrics Cards */}
        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
          {/* Energy */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '14px 10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>
              ENERGY
            </div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#FFFFFF' }}>
              {energy}
            </div>
            <div style={{ fontSize: '11px', color: '#68718B' }}>kWh</div>
          </div>

          {/* Power */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '14px 10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>
              POWER
            </div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#FFFFFF' }}>
              {power}
            </div>
            <div style={{ fontSize: '11px', color: '#68718B' }}>kW</div>
          </div>

          {/* Live Cost */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '14px 10px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>
              CURRENT COST
            </div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#00C896' }}>
              ₹{cost}
            </div>
            <div style={{ fontSize: '11px', color: '#68718B' }}>Incl. taxes</div>
          </div>
        </div>

        {/* Vehicle & Station Badge */}
        <div style={{
          width: '100%',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>Connected Vehicle</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
              {session?.vehicle_model || 'Primary EV'} ({session?.registration_no || 'MH12XB2903'})
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}>Station</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
              {session?.station_name || 'ChargerHub Station'}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Stop Button */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '16px 20px',
        background: '#0E1326',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <button
          type="button"
          onClick={handleStopCharging}
          disabled={stopping}
          style={{
            width: '100%',
            background: '#EF4444',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '16px',
            padding: '15px',
            fontSize: '16px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 16px rgba(239, 68, 68, 0.3)'
          }}
        >
          <Power size={18} />
          <span>{stopping ? 'Stopping Charger...' : 'Stop Charging'}</span>
        </button>
      </div>

      {/* Completion Receipt Modal */}
      {showReceipt && (
        <div className="modal-overlay">
          <div className="bottom-sheet" style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div className="sheet-handle" />
            <CheckCircle size={56} color="#10B981" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#151C38', marginBottom: '4px' }}>
              Charging Completed!
            </h3>
            <p style={{ fontSize: '13px', color: '#68718B', marginBottom: '24px' }}>
              Session finalized and billed to your ChargerHub Wallet
            </p>

            <div style={{ background: '#F8FAFC', borderRadius: '16px', padding: '16px', border: '1px solid #E2E8F0', marginBottom: '24px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: '#68718B' }}>Energy Dispensed</span>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#151C38' }}>{receiptData?.energyKwh} kWh</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: '#68718B' }}>Battery Level</span>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#10B981' }}>{receiptData?.finalSoc}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: '#68718B' }}>Eco Impact</span>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#10B981' }}>+{receiptData?.greenKm} Green KM 🍃</span>
              </div>
              <div style={{ height: '1px', background: '#E2E8F0', margin: '10px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#151C38' }}>Total Deducted</span>
                <span style={{ fontSize: '18px', fontWeight: 900, color: '#00C896' }}>₹{receiptData?.totalCost}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowReceipt(false);
                onViewHistory();
              }}
              className="btn-primary"
              style={{ background: '#00C896' }}
            >
              View in Wallet Activity
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


