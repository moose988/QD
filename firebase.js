import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAd32bdUpQa6BUHpVhLOi0rjW4L2hczSaM',
  authDomain: 'qdsystems-67764.firebaseapp.com',
  projectId: 'qdsystems-67764',
  storageBucket: 'qdsystems-67764.firebasestorage.app',
  messagingSenderId: '59239708155',
  appId: '1:59239708155:web:62f2b3238b7ece3185c75e',
  measurementId: 'G-MMRG84EYH7'
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export { app };
