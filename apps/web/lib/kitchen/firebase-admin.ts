import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import 'server-only';

function app() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Firebase is not configured.');
  return (
    getApps().find((a) => a.name === 'gordon') ??
    initializeApp({ credential: applicationDefault(), projectId }, 'gordon')
  );
}
export const adminAuth = () => getAuth(app());
export const firestore = () =>
  getFirestore(app(), process.env.FIRESTORE_DATABASE_ID || '(default)');
