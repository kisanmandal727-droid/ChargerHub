import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

let firebaseAuth;

export function getFirebaseAdminAuth() {
  if (firebaseAuth) return firebaseAuth;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  let credential;
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      credential = cert(serviceAccount);
      projectId ||= serviceAccount.project_id;
    } catch {
      const error = new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON');
      error.code = 'FIREBASE_ADMIN_NOT_CONFIGURED';
      throw error;
    }
  } else {
    credential = applicationDefault();
  }

  if (!projectId) {
    const error = new Error('Set FIREBASE_PROJECT_ID or provide a service account with project_id');
    error.code = 'FIREBASE_ADMIN_NOT_CONFIGURED';
    throw error;
  }

  const app = getApps()[0] || initializeApp({ credential, projectId });
  firebaseAuth = getAuth(app);
  return firebaseAuth;
}
