import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Zap, IndianRupee, AlertCircle } from 'lucide-react';
import { api } from '../../api/client.js';
import { useVehicle } from '../../context/VehicleContext.jsx';
import { useWallet } from '../../context/WalletContext.jsx';

export default function ChargingConfig({ station, connector, onBack, onProceedToActive }) {
  const { primaryVehicle } = useVehicle();
  const { wallet, setShowTopupModal } = useWallet();

  const [chargeType, setChargeType] = useState('Percentage'); // 'Amount' | 'Units' | 'Time' | 'Percentage'
  const [targetValue, setTargetValue] = useState('50');
  const [calcResult, setCalcResult] = useState({
    units_kwh: 1.5,
    time_minutes: 28,
    cost_inr: 27
  });
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Call calculate API whenever input changes
  useEffect(() => {
    const doCalculate = async () => {
      if (!targetValue || parseFloat(targetValue) <= 0) return;
      setLoadingCalc(true);
      try {
        const res = await api.post('/charging/calculate', {
          charge_type: chargeType,
          target_value: parseFloat(targetValue),
          connector_id: connector.id,
          vehicle_id: primaryVehicle?.id
        });
        setCalcResult({
          units_kwh: res.units_kwh,
          time_minutes: res.time_minutes,
          cost_inr: res.cost_inr
        });
        setErrorMsg('');
      } catch (err) {
        console.error('Calculation error:', err);
      } finally {
        setLoadingCalc(false);
      }
    };

    const timer = setTimeout(doCalculate, 250);
    return () => clearTimeout(timer);
  }, [chargeType, targetValue, connector, primaryVehicle]);

  const handleProceed = async () => {
    // The UI provides an early warning; the backend rechecks the live balance and estimate before starting.
    const availableBalance = Number(wallet.balance || 0);
    const estimatedCost = Number(calcResult.cost_inr || 0);
    if (availableBalance + 0.000001 < estimatedCost) {
      setErrorMsg(`Insufficient wallet balance. This session is estimated to cost ₹${estimatedCost.toFixed(2)}; your balance is ₹${availableBalance.toFixed(2)}.`);
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.post('/charging/start', {
        connector_id: connector.id,
        vehicle_id: primaryVehicle?.id,
        charge_type: chargeType,
        target_value: parseFloat(targetValue)
      });
      onProceedToActive(res.session);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to start session');
      if (err.status === 402) {
        setShowTopupModal(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getUnitSuffix = () => {
    if (chargeType === 'Percentage') return '%';
    if (chargeType === 'Amount') return '₹';
    if (chargeType === 'Units') return ' kWh';
    if (chargeType === 'Time') return ' mins';
    return '';
  };

  const getSubLabel = () => {
    if (chargeType === 'Percentage') return 'Charge until the battery reaches this level';
    if (chargeType === 'Amount') return 'Enter amount in Rupees (Min ₹20)';
    if (chargeType === 'Units') return 'Enter required energy units in kWh';
    if (chargeType === 'Time') return 'Enter charging duration in minutes';
    return '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC', position: 'relative' }}>
      {/* Top Header matching screenshot */}
      <div style={{
        background: '#151C38',
        color: '#FFFFFF',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: '#FFFFFF', cursor: 'pointer', padding: '4px' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h2 style={{ fontSize: '18px', fontWeight: 800, textAlign: 'center', flex: 1, paddingRight: '26px' }}>
          Select Charging Type
        </h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 100px' }}>
        {/* Segmented Control / Tabs matching screenshot (Amount | Units | Time | Percentage) */}
        <div style={{
          background: '#EAEFF8',
          borderRadius: '16px',
          padding: '4px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '4px',
          marginBottom: '36px'
        }}>
          {['Amount', 'Units', 'Time', 'Percentage'].map((type) => {
            const isActive = chargeType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setChargeType(type);
                  if (type === 'Percentage') setTargetValue('50');
                  else if (type === 'Amount') setTargetValue('150');
                  else if (type === 'Units') setTargetValue('10');
                  else if (type === 'Time') setTargetValue('45');
                }}
                style={{
                  background: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? '#151C38' : '#717B9E',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: '13px',
                  padding: '10px 4px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                {type}
              </button>
            );
          })}
        </div>

        {/* Large Central Input/Display matching screenshot (e.g. 50%) */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: '2px',
            marginBottom: '8px'
          }}>
            {chargeType === 'Amount' && (
              <span style={{ fontSize: '38px', fontWeight: 900, color: '#151C38' }}>₹</span>
            )}
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              style={{
                fontSize: '52px',
                fontWeight: 900,
                color: '#151C38',
                border: 'none',
                background: 'transparent',
                textAlign: 'center',
                width: `${Math.max(2, targetValue.length) * 36}px`,
                maxWidth: '220px',
                outline: 'none',
                fontFamily: 'inherit'
              }}
              min="1"
              max={chargeType === 'Percentage' ? 100 : 5000}
            />
            {chargeType !== 'Amount' && (
              <span style={{ fontSize: '42px', fontWeight: 900, color: '#151C38' }}>
                {getUnitSuffix()}
              </span>
            )}
          </div>

          <p style={{ fontSize: '13px', color: '#68718B', fontWeight: 600 }}>
            {getSubLabel()}
          </p>

          {/* Quick preset chips */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
            {(chargeType === 'Percentage' ? ['25', '50', '80', '100'] :
              chargeType === 'Amount' ? ['100', '200', '500', '1000'] :
              chargeType === 'Units' ? ['5', '10', '15', '25'] :
              ['15', '30', '45', '60']
            ).map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setTargetValue(val)}
                style={{
                  background: targetValue === val ? '#E0FBF4' : '#FFFFFF',
                  color: targetValue === val ? '#007A5C' : '#151C38',
                  border: targetValue === val ? '1.5px solid #00C896' : '1px solid #E2E8F0',
                  padding: '6px 14px',
                  borderRadius: '16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {chargeType === 'Amount' ? `₹${val}` : `${val}${getUnitSuffix()}`}
              </button>
            ))}
          </div>
        </div>

        {/* 3 Calculated Summary Cards matching screenshot (28 mins | 1.5 units | ₹27) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          marginBottom: '24px'
        }}>
          {/* Time */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            padding: '14px 10px',
            textAlign: 'center',
            border: '1px solid #EAEFF6',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}>
            <Clock size={16} color="#717B9E" />
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>
              {calcResult.time_minutes} mins
            </span>
          </div>

          {/* Units */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            padding: '14px 10px',
            textAlign: 'center',
            border: '1px solid #EAEFF6',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}>
            <Zap size={16} color="#717B9E" />
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>
              {calcResult.units_kwh} units
            </span>
          </div>

          {/* Cost */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            padding: '14px 10px',
            textAlign: 'center',
            border: '1px solid #EAEFF6',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px'
          }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#151C38' }}>
              ₹{calcResult.cost_inr}
            </span>
          </div>
        </div>

        {/* Selected Charger Info Pill */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          padding: '12px 16px',
          border: '1px solid #EAEFF6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#68718B' }}>Selected Charger</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#151C38' }}>
              {connector?.charger_name} ({connector?.power_kw}kW)
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#68718B' }}>Wallet Balance</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: wallet.balance < calcResult.cost_inr ? '#EF4444' : '#10B981' }}>
              ₹{wallet.balance.toFixed(2)}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div style={{
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#B91C1C',
            padding: '10px 14px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <div style={{ flex: 1 }}>{errorMsg}</div>
            {wallet.balance < calcResult.cost_inr && (
              <button
                type="button"
                onClick={() => setShowTopupModal(true)}
                style={{
                  background: '#B91C1C',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Top up
              </button>
            )}
          </div>
        )}
      </div>

      {/* Fixed Bottom "Proceed" Button matching screenshot */}
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
          onClick={handleProceed}
          disabled={submitting}
          className="btn-primary"
          style={{ background: '#00C896' }}
        >
          {submitting ? 'Initiating Charger Handshake...' : 'Proceed'}
        </button>
      </div>
    </div>
  );
}
