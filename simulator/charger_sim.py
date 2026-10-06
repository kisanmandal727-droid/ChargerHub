"""
EV Charger Hardware Simulation Engine (Phase 1)
Simulates OCPP 1.6 / IoT Smart Chargers connected to the Node.js EV Backend API.

Features:
- Telemetry generation: Active Power (kW), Meter Values (kWh), Battery SoC (%), Voltage (V), Current (A).
- Dynamic power curve simulation (tapers power above 80% SoC like real EV lithium batteries).
- Interactive mode and Automated daemon mode.
- Pre-structured OCPP 1.6 MeterValues & StatusNotification JSON payloads for future hardware bridge.
"""

import sys
import time
import json
import argparse
import random
import requests

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

API_BASE = "http://localhost:5000/api"
SIMULATOR_API_KEY = "ev_sim_secret_token_8899"

HEADERS = {
    "Content-Type": "application/json",
    "x-simulator-key": SIMULATOR_API_KEY
}

def check_backend_health():
    try:
        r = requests.get(f"{API_BASE}/health", timeout=3)
        if r.status_code == 200:
            print("Connected to Node.js Backend API:", r.json())
            return True
    except Exception as e:
        print(f"[!] Backend unreachable at {API_BASE}: {e}")
    return False

def format_ocpp_meter_value(connector_id, power_kw, energy_kwh, soc_pct):
    """Generates an OCPP 1.6J MeterValues compliant packet"""
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    voltage = round(random.uniform(398.0, 404.0), 1)
    current = round((power_kw * 1000.0) / (voltage * 1.732), 1) if power_kw > 0 else 0.0

    return {
        "ocppMessage": [
            2,
            f"msg-{int(time.time()*1000)}",
            "MeterValues",
            {
                "connectorId": connector_id,
                "transactionId": int(time.time()),
                "meterValue": [
                    {
                        "timestamp": timestamp,
                        "sampledValue": [
                            {"value": str(round(energy_kwh * 1000, 1)), "context": "Sample.Periodic", "format": "Raw", "measurand": "Energy.Active.Import.Register", "unit": "Wh"},
                            {"value": str(round(power_kw, 2)), "context": "Sample.Periodic", "format": "Raw", "measurand": "Power.Active.Import", "unit": "kW"},
                            {"value": str(soc_pct), "context": "Sample.Periodic", "format": "Raw", "measurand": "SoC", "unit": "Percent"},
                            {"value": str(voltage), "context": "Sample.Periodic", "format": "Raw", "measurand": "Voltage", "unit": "V"},
                            {"value": str(current), "context": "Sample.Periodic", "format": "Raw", "measurand": "Current.Import", "unit": "A"}
                        ]
                    }
                ]
            }
        ],
        "metrics": {
            "power_kw": power_kw,
            "energy_kwh": energy_kwh,
            "soc_pct": soc_pct,
            "voltage": voltage,
            "current": current
        }
    }

def send_telemetry(session_id, soc_pct, energy_kwh, power_kw, total_cost, status="charging"):
    url = f"{API_BASE}/charging/{session_id}/telemetry"
    payload = {
        "current_soc_pct": soc_pct,
        "energy_delivered_kwh": energy_kwh,
        "current_power_kw": power_kw,
        "total_cost": total_cost,
        "status": status
    }
    try:
        r = requests.post(url, json=payload, headers=HEADERS, timeout=4)
        return r.status_code == 200
    except Exception as e:
        print(f"[!] Failed to push telemetry: {e}")
        return False

def simulate_session(session_id, start_soc, target_soc, max_power_kw, price_per_kwh, battery_capacity=40.0, step_delay=1.5):
    print(f"\n=======================================================")
    print(f"⚡ Starting EV Charging Simulation for Session #{session_id}")
    print(f"Initial SoC: {start_soc}% -> Target: {target_soc}% | Power: {max_power_kw}kW | Cap: {battery_capacity}kWh")
    print(f"=======================================================")

    current_soc = start_soc
    energy_kwh = 0.0

    while current_soc < target_soc:
        # Lithium-ion taper power curve: full speed up to 80%, taper to 35% between 80-100%
        if current_soc > 80:
            effective_power = max_power_kw * (0.4 + 0.6 * (100 - current_soc) / 20.0)
        else:
            effective_power = max_power_kw

        # In simulation step (step_delay seconds), let's simulate accelerated 30-second charge increments
        sim_hours = (20.0 / 3600.0) # 20 seconds simulated per real step
        delivered_this_step = effective_power * sim_hours
        energy_kwh += delivered_this_step

        soc_gain = max(1, int((delivered_this_step / battery_capacity) * 100))
        current_soc = min(target_soc, current_soc + soc_gain)
        cost = round(energy_kwh * price_per_kwh * 1.18, 2)

        # Generate OCPP packet
        ocpp = format_ocpp_meter_value(connector_id=1, power_kw=effective_power, energy_kwh=energy_kwh, soc_pct=current_soc)

        # Push to backend
        send_telemetry(session_id, current_soc, round(energy_kwh, 3), round(effective_power, 1), cost, "charging")

        print(f"[{time.strftime('%H:%M:%S')}] 🔋 SoC: {current_soc}% | ⚡ {round(effective_power,1)} kW | 📊 {round(energy_kwh,2)} kWh | 💰 ₹{cost} | {ocpp['metrics']['voltage']}V @ {ocpp['metrics']['current']}A")
        time.sleep(step_delay)

    print(f"\n✅ Target SoC {target_soc}% Reached! Completing session...")
    send_telemetry(session_id, current_soc, round(energy_kwh, 3), 0.0, round(energy_kwh * price_per_kwh * 1.18, 2), "completed")
    print(f"Session #{session_id} finished successfully. Total energy: {round(energy_kwh,2)} kWh.")

def run_auto_monitor():
    print("[*] Charger Simulator running in AUTO mode.")
    print("[*] Monitoring backend for initiated sessions...")
    while True:
        try:
            # We can check health or listen for commands
            time.sleep(3)
        except KeyboardInterrupt:
            print("\nSimulator stopped.")
            break

def main():
    parser = argparse.ArgumentParser(description="EV Charging Hardware Simulator")
    parser.add_argument("--mode", choices=["auto", "sim", "test"], default="test", help="Simulation mode")
    parser.add_argument("--session", type=int, default=1, help="Session ID to simulate")
    parser.add_argument("--start_soc", type=int, default=30, help="Initial SoC %")
    parser.add_argument("--target_soc", type=int, default=80, help="Target SoC %")
    parser.add_argument("--power", type=float, default=22.0, help="Charger power rating in kW")
    parser.add_argument("--price", type=float, default=16.0, help="Price per kWh")
    args = parser.parse_args()

    print("==================================================")
    print("   STATION CHARGER HARDWARE SIMULATOR (Phase 1)   ")
    print("==================================================")

    if not check_backend_health():
        print("[!] Backend API not responding at http://localhost:5000. Please start the backend first.")
        sys.exit(1)

    if args.mode == "test":
        print("\nRunning test telemetry packet generation...")
        ocpp_test = format_ocpp_meter_value(1, args.power, 1.45, 52)
        print("Sample OCPP MeterValues Payload:")
        print(json.dumps(ocpp_test, indent=2))
        print("\nSimulating charging cycle...")
        simulate_session(args.session, args.start_soc, args.target_soc, args.power, args.price, step_delay=0.8)
    elif args.mode == "sim":
        simulate_session(args.session, args.start_soc, args.target_soc, args.power, args.price)
    elif args.mode == "auto":
        run_auto_monitor()

if __name__ == "__main__":
    main()
