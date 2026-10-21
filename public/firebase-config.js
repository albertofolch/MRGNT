import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import { getStorage, connectStorageEmulator } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBJ3pZnYef8bDsSpNSvdiU1QFE3rS9XlyE',
  authDomain: 'mrgnt-webpage.firebaseapp.com',
  projectId: 'mrgnt-webpage',
  storageBucket: 'mrgnt-webpage.firebasestorage.app',
  messagingSenderId: '955000045296',
  appId: '1:955000045296:web:64bd4311d68046d3c88c35',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Only connect to emulators when running via firebase emulators:start (port 5050)
if (location.hostname === 'localhost' && location.port === '5050') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectStorageEmulator(storage, 'localhost', 9199);
}
