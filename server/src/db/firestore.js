import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdminAuth } from '../services/firebaseAdmin.js';

let firestore;

export function getStore() {
  if (!firestore) firestore = getFirestore(getFirebaseAdminAuth().app);
  return firestore;
}

const col = (name) => getStore().collection(name);
const docId = (id) => String(Number(id));

export async function init() {
  // Resolve credentials and the Firestore connection at startup.
  getStore();
  await getStore().collection('_meta').doc('health').set({ checked_at: new Date().toISOString() }, { merge: true });
}

export async function getById(collectionName, id) {
  const snap = await col(collectionName).doc(docId(id)).get();
  return snap.exists ? snap.data() : null;
}

export async function listRecords(collectionName) {
  const snap = await col(collectionName).get();
  return snap.docs.map((item) => item.data());
}

export async function findRecords(collectionName, predicate) {
  return (await listRecords(collectionName)).filter(predicate);
}

export async function findRecord(collectionName, predicate) {
  return (await findRecords(collectionName, predicate))[0] || null;
}

export async function whereRecords(collectionName, field, value, { orderBy = null, direction = 'asc', limit = null } = {}) {
  let query = col(collectionName).where(field, '==', value);
  if (orderBy) query = query.orderBy(orderBy, direction);
  if (limit) query = query.limit(limit);
  const snap = await query.get();
  return snap.docs.map((item) => item.data());
}

export async function firstWhere(collectionName, field, value) {
  const records = await whereRecords(collectionName, field, value, { limit: 1 });
  return records[0] || null;
}

export async function createRecord(collectionName, values, requestedId) {
  let id = requestedId;
  if (id === undefined || id === null) {
    id = await getStore().runTransaction(async (transaction) => {
      const counterRef = getStore().collection('_counters').doc(collectionName);
      const counter = await transaction.get(counterRef);
      const nextId = Number(counter.data()?.value || 0) + 1;
      transaction.set(counterRef, { value: nextId });
      return nextId;
    });
  }
  const record = { id: Number(id), created_at: new Date().toISOString(), ...values };
  await col(collectionName).doc(docId(id)).set(record);
  return record;
}

export async function updateRecord(collectionName, id, changes) {
  const ref = col(collectionName).doc(docId(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const patch = { ...changes, updated_at: new Date().toISOString() };
  await ref.set(patch, { merge: true });
  return { ...snap.data(), ...patch };
}

export async function deleteRecord(collectionName, id) {
  const ref = col(collectionName).doc(docId(id));
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.delete();
  return snap.data();
}

export async function incrementRecord(collectionName, id, field, amount = 1) {
  return getStore().runTransaction(async (transaction) => {
    const ref = col(collectionName).doc(docId(id));
    const snap = await transaction.get(ref);
    if (!snap.exists) return null;
    const record = snap.data();
    const updated = { [field]: Number(record[field] || 0) + amount, updated_at: new Date().toISOString() };
    transaction.set(ref, updated, { merge: true });
    return { ...record, ...updated };
  });
}

const db = {
  init,
  get: getById,
  list: listRecords,
  find: findRecords,
  findOne: findRecord,
  where: whereRecords,
  findOneBy: firstWhere,
  create: createRecord,
  update: updateRecord,
  delete: deleteRecord,
  increment: incrementRecord,
  collection: col,
  store: getStore,
};

export default db;
