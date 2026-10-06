# Python EV Charger Simulator (Phase 1)

This module provides simulated EV charging hardware functionality adhering to OCPP 1.6J `MeterValues` and live battery charge rate curves.

## Features
- Connects to the Express REST API and sends periodic telemetry (`power_kw`, `energy_kwh`, `soc_pct`, `voltage`, `current`, `total_cost`).
- Realistic lithium-ion battery taper curve (full speed up to 80% SoC, progressively tapering down to 100%).
- Prepares structured OCPP 1.6 MeterValues payloads ready for real physical chargers and OCPP/MQTT bridges in Phase 2.

## Quick Start

1. Install requirements:
```bash
pip install -r requirements.txt
```

2. Run test telemetry simulation:
```bash
python charger_sim.py --mode=test
```

3. Simulate a specific active charging session:
```bash
python charger_sim.py --mode=sim --session=<SESSION_ID> --start_soc=30 --target_soc=80 --power=22.0 --price=15.0
```
