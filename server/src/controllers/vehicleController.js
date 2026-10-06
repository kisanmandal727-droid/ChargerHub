import db from '../db/firestore.js';
import { PRESET_CATALOG } from '../data/vehicleCatalog.js';

const normalizeRegistrationNumber = (value) => value.trim().toUpperCase().replace(/[\s-]+/g, '');
const isValidIndianRegistrationNumber = (value) => /^(?:[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}|[A-Z]{2}\d{1,2}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/.test(value);

export const getCatalog = async (req, res) => {
  return res.json({ catalog: PRESET_CATALOG });
};

export const getMyVehicles = async (req, res) => {
  try {
    const vehicles = await db.where('vehicles', 'user_id', Number(req.user.id));
    vehicles.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || String(b.created_at).localeCompare(String(a.created_at)));
    return res.json({ vehicles });
  } catch (err) {
    console.error('Error getting vehicles:', err);
    return res.status(500).json({ error: 'Failed to retrieve vehicles' });
  }
};

export const addVehicle = async (req, res) => {
  try {
    const {
      catalog_id,
      brand,
      model,
      variant,
      registration_no,
      battery_capacity_kwh,
      current_battery_pct = 50,
    } = req.body;

    if (typeof registration_no !== 'string' || !registration_no.trim() || !model || !brand) {
      return res.status(400).json({ error: 'Vehicle model and registration number are required' });
    }

    const cleanReg = normalizeRegistrationNumber(registration_no);
    if (!isValidIndianRegistrationNumber(cleanReg)) {
      return res.status(400).json({ error: 'Enter a valid Indian vehicle number format, such as MH12AB1234 or 24BH1234AA' });
    }

    // Check if user already has vehicles
    const existingVehicles = await db.where('vehicles', 'user_id', Number(req.user.id));
    if (existingVehicles.some((vehicle) => normalizeRegistrationNumber(String(vehicle.registration_no || '')) === cleanReg)) {
      return res.status(409).json({ error: 'This vehicle number is already registered to your account' });
    }
    const count = existingVehicles.length;
    const isPrimary = count === 0; // If first vehicle, make it primary

    const preset = catalog_id
      ? PRESET_CATALOG.find((item) => item.id === String(catalog_id))
      : PRESET_CATALOG.find((item) => item.brand.toLowerCase() === String(brand).toLowerCase()
        && item.model.toLowerCase() === String(model).toLowerCase()
        && (!variant || item.variant.toLowerCase() === String(variant).toLowerCase()));
    if (!preset) {
      return res.status(400).json({ error: 'Select a vehicle from the available vehicle list' });
    }

    const requestedCapacity = Number(battery_capacity_kwh);
    const requiresCapacityConfirmation = preset.battery_capacity_kwh == null || preset.capacity_is_estimate;
    const finalCapacity = requiresCapacityConfirmation
      ? (Number.isFinite(requestedCapacity) && requestedCapacity > 0 ? requestedCapacity : null)
      : preset.battery_capacity_kwh;
    if (!finalCapacity) {
      return res.status(400).json({ error: 'Enter the exact battery capacity for this vehicle variant before registering it' });
    }

    const vehicle = await db.create('vehicles', {
      user_id: req.user.id,
      type: preset.type,
      brand: preset.brand,
      model: preset.model,
      variant: preset.variant,
      registration_no: cleanReg,
      battery_capacity_kwh: Number(finalCapacity),
      capacity_is_estimate: preset.capacity_is_estimate,
      capacity_user_entered: requiresCapacityConfirmation,
      specification_status: requiresCapacityConfirmation ? 'Capacity entered by user; not independently verified' : preset.specification_status,
      connector_type: preset.connector_type,
      current_battery_pct: Number(current_battery_pct),
      is_primary: isPrimary,
      image_url: preset.image_url || null,
    });

    // Create notification
    await db.create('notifications', {
      user_id: req.user.id, title: 'Vehicle Registered!',
      message: `${model} (${cleanReg}) registered successfully! You can now start charging.`, type: 'system', is_read: false,
    });

    return res.status(201).json({
      message: 'Vehicle added successfully',
      vehicle
    });
  } catch (err) {
    console.error('Add vehicle error:', err);
    return res.status(500).json({ error: 'Failed to add vehicle' });
  }
};

export const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const { current_battery_pct, registration_no, model, battery_capacity_kwh, connector_type } = req.body;

    const existing = await db.get('vehicles', id);
    if (!existing || Number(existing.user_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: 'Vehicle not found or unauthorized' });
    }
    const changes = {};
    if (registration_no !== undefined) {
      if (typeof registration_no !== 'string' || !isValidIndianRegistrationNumber(normalizeRegistrationNumber(registration_no))) {
        return res.status(400).json({ error: 'Enter a valid Indian vehicle number format, such as MH12AB1234 or 24BH1234AA' });
      }
      changes.registration_no = normalizeRegistrationNumber(registration_no);
    }
    for (const [key, value] of Object.entries({ current_battery_pct, model, battery_capacity_kwh, connector_type })) {
      if (value !== undefined && value !== null) changes[key] = value;
    }
    const vehicle = await db.update('vehicles', id, changes);

    return res.json({
      message: 'Vehicle updated successfully',
      vehicle
    });
  } catch (err) {
    console.error('Update vehicle error:', err);
    return res.status(500).json({ error: 'Failed to update vehicle' });
  }
};

export const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.get('vehicles', id);
    if (!existing || Number(existing.user_id) !== Number(req.user.id)) {
      return res.status(404).json({ error: 'Vehicle not found or unauthorized' });
    }
    await db.delete('vehicles', id);

    // If deleted vehicle was primary, promote another one if exists
    if (existing.is_primary) {
      const next = (await db.where('vehicles', 'user_id', Number(req.user.id)))[0];
      if (next) await db.update('vehicles', next.id, { is_primary: true });
    }

    return res.json({ message: 'Vehicle deleted successfully' });
  } catch (err) {
    console.error('Delete vehicle error:', err);
    return res.status(500).json({ error: 'Failed to delete vehicle' });
  }
};

export const setPrimaryVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    // Reset all to false
    const ownedVehicles = await db.where('vehicles', 'user_id', Number(req.user.id));
    const target = ownedVehicles.find((item) => Number(item.id) === Number(id));
    if (!target) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    await Promise.all(ownedVehicles.map((item) => db.update('vehicles', item.id, { is_primary: item.id === target.id })));
    const vehicle = { ...target, is_primary: true };

    return res.json({
      message: 'Primary vehicle updated',
      vehicle
    });
  } catch (err) {
    console.error('Set primary vehicle error:', err);
    return res.status(500).json({ error: 'Failed to set primary vehicle' });
  }
};
