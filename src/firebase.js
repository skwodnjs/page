import {initializeApp} from 'firebase/app';
import {getAuth} from 'firebase/auth';
import {getFirestore} from 'firebase/firestore';

const firebaseConfig={
  apiKey:"AIzaSyCMbxs2CbU9eY9cOSsZKUa-mIo8KB1HOoU",
  authDomain:"page-skwodnjs.firebaseapp.com",
  projectId:"page-skwodnjs",
  storageBucket:"page-skwodnjs.firebasestorage.app",
  messagingSenderId:"675578316692",
  appId:"1:675578316692:web:c89c8dd1820e38789eb181"
};

export const OWNER_EMAIL=(import.meta.env.VITE_OWNER_EMAIL||'').trim().toLowerCase();
export const OWNER_UID=(import.meta.env.VITE_OWNER_UID||'').trim();
export const firebaseApp=initializeApp(firebaseConfig);
export const auth=getAuth(firebaseApp);
// Deliberately use the web SDK's in-memory Firestore cache. Persistent caches
// can retain private notes on disk after the password session expires.
export const db=getFirestore(firebaseApp);
export const isOwner=user=>!!user&&!!OWNER_EMAIL&&user.email?.toLowerCase()===OWNER_EMAIL&&(!OWNER_UID||user.uid===OWNER_UID);
