import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import defaultConfig from '../../firebase-applet-config.json';
import { AssessmentSubmission } from '../types';

// Support Vercel environment variables (VITE_FIREBASE_*) with fallback to firebase-applet-config.json
const rawConfig = defaultConfig as Record<string, any>;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || rawConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || rawConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || rawConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || rawConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || rawConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || rawConfig.appId,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Use the default Firestore database instance
export const db = getFirestore(app);

const SUBMISSIONS_COLLECTION = 'submissions';

export const saveSubmissionToFirestore = async (submission: AssessmentSubmission): Promise<void> => {
  try {
    const docRef = doc(db, SUBMISSIONS_COLLECTION, submission.id);
    await setDoc(docRef, submission);
    console.log(`[Firestore] Successfully saved submission ${submission.id} to Cloud Firestore.`);
  } catch (error) {
    console.error('Error saving submission to Firestore:', error);
    throw error;
  }
};

export const getSubmissionById = async (id: string): Promise<AssessmentSubmission | null> => {
  try {
    const docRef = doc(db, SUBMISSIONS_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as AssessmentSubmission;
    }
    return null;
  } catch (error) {
    console.error('Error fetching submission by ID:', error);
    return null;
  }
};

export const getAllSubmissionsFromFirestore = async (): Promise<AssessmentSubmission[]> => {
  try {
    const q = query(collection(db, SUBMISSIONS_COLLECTION), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    const list: AssessmentSubmission[] = [];
    snapshot.forEach((d) => {
      list.push(d.data() as AssessmentSubmission);
    });
    return list;
  } catch (error) {
    console.error('Error fetching all submissions from Firestore:', error);
    throw error;
  }
};

export const deleteSubmissionFromFirestore = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, SUBMISSIONS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting submission from Firestore:', error);
    throw error;
  }
};

export const subscribeToSubmissions = (
  onData: (submissions: AssessmentSubmission[]) => void,
  onError?: (error: Error) => void
) => {
  const q = query(collection(db, SUBMISSIONS_COLLECTION), orderBy('timestamp', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const data: AssessmentSubmission[] = [];
      snapshot.forEach((doc) => {
        data.push(doc.data() as AssessmentSubmission);
      });
      onData(data);
    },
    (err) => {
      console.error('Error subscribing to submissions:', err);
      if (onError) onError(err);
    }
  );
};

export interface GoogleSheetSettings {
  webhookUrl?: string;
  spreadsheetUrl?: string;
  spreadsheetId?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const SETTINGS_COLLECTION = 'settings';
const GSHEET_DOC_ID = 'google_sheets';

export const saveGoogleSheetSettingsToFirestore = async (settings: GoogleSheetSettings): Promise<void> => {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, GSHEET_DOC_ID);
    await setDoc(docRef, { ...settings, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (error) {
    console.error('Error saving Google Sheet settings to Firestore:', error);
  }
};

export const getGoogleSheetSettingsFromFirestore = async (): Promise<GoogleSheetSettings | null> => {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, GSHEET_DOC_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as GoogleSheetSettings;
    }
    return null;
  } catch (error) {
    console.error('Error fetching Google Sheet settings:', error);
    return null;
  }
};

export const subscribeToGoogleSheetSettings = (
  onData: (settings: GoogleSheetSettings) => void
) => {
  const docRef = doc(db, SETTINGS_COLLECTION, GSHEET_DOC_ID);
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      onData(snap.data() as GoogleSheetSettings);
    }
  });
};

