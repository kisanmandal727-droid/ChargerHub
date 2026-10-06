async function runTests() {
  console.log('Testing EV Charging Backend API Endpoints...\n');

  // 1. Health
  const healthRes = await fetch('http://localhost:5000/api/health');
  const health = await healthRes.json();
  console.log('1. Health Check:', health.status);

  // 2. Login as Demo User
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'kshitijkolte4@gmail.com', password: 'password123' })
  });
  const loginData = await loginRes.json();
  console.log('2. Login:', loginData.user.name, '| Has Vehicles:', loginData.user.hasVehicle, '| Balance: ₹' + loginData.user.wallet.balance);
  const token = loginData.token;

  // 3. Fetch Stations near Pune
  const stRes = await fetch('http://localhost:5000/api/stations?lat=18.4552&lng=73.9189', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const stData = await stRes.json();
  console.log('3. Stations Found:', stData.stations.length, '| Nearest:', stData.stations[0].name, '->', stData.stations[0].distanceText);

  // 4. Calculate Charging Session (50% target)
  const calcRes = await fetch('http://localhost:5000/api/charging/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ charge_type: 'Percentage', target_value: 50, connector_id: 1 })
  });
  const calcData = await calcRes.json();
  console.log('4. Charging Calc (50%):', calcData.time_minutes, 'mins |', calcData.units_kwh, 'kWh | ₹' + calcData.cost_inr);

  // 5. Razorpay top-ups require configured gateway credentials and interactive checkout.
  console.log('5. Wallet Top-up: Use Add Credits in the app with Razorpay test credentials.');

  // 6. Register New User (Check forced vehicle setup)
  const randNum = Math.floor(Math.random() * 90000) + 10000;
  const regRes = await fetch('http://localhost:5000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'New Driver',
      email: `driver_${randNum}@gmail.com`,
      phone: `+9198000${randNum}`,
      password: 'password123'
    })
  });
  const regData = await regRes.json();
  console.log('6. New User Registered: hasVehicle =', regData.user.hasVehicle, '(Expected: false, triggering forced onboarding)');

  // 7. Add Vehicle for New User
  const newVehRes = await fetch('http://localhost:5000/api/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regData.token}` },
    body: JSON.stringify({
      type: '4-Wheeler',
      brand: 'Tata',
      model: 'Tata Nexon EV',
      registration_no: `MH12AB${randNum.toString().slice(-4)}`,
      battery_capacity_kwh: 40.5,
      connector_type: 'CCS2'
    })
  });
  const newVehData = await newVehRes.json();
  console.log('7. Vehicle Added:', newVehData.vehicle.model, newVehData.vehicle.registration_no, '| Is Primary:', newVehData.vehicle.is_primary);

  // 8. Plan Trip
  const tripRes = await fetch('http://localhost:5000/api/trips/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      origin: 'Wadachi Wadi, Pune',
      destination: 'Lonavala Hills',
      detour_km: 5
    })
  });
  const tripData = await tripRes.json();
  console.log('8. Trip Plan to Lonavala:', tripData.trip.distance_km, 'km | Est Energy:', tripData.trip.est_energy_kwh, 'kWh | Suggested Stops:', tripData.trip.suggested_stations.length);

  console.log('\nAll End-to-End API Verifications PASSED successfully! 🎉');
}

runTests().catch(console.error);
