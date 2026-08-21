import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
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
  firestoreDatabaseId:
    import.meta.env.VITE_FIREBASE_DATABASE_ID ||
    rawConfig.firestoreDatabaseId ||
    rawConfig.databaseId ||
    'ai-studio-ptdianpanduprata-f0411a6c-b5b8-45a7-a73d-20750fd70715',
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

const SUBMISSIONS_COLLECTION = 'submissions';

export const saveSubmissionToFirestore = async (submission: AssessmentSubmission): Promise<void> => {
  try {
    const docRef = doc(db, SUBMISSIONS_COLLECTION, submission.id);
    await setDoc(docRef, submission);
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

