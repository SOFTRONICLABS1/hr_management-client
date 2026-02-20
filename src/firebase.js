import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyB3l6ugj5B0K4o8zc0ti-rHDEKagZ9mZIs',
  authDomain: 'hr-management-1c229.firebaseapp.com',
  projectId: 'hr-management-1c229',
  storageBucket: 'hr-management-1c229.firebasestorage.app',
  messagingSenderId: '263752827410',
  appId: '1:263752827410:web:3e2791df0154ea5c558ecb',
  measurementId: 'G-3WFLJEW0KQ',
}

const app = initializeApp(firebaseConfig)

// Analytics only works in supported browser environments.
if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) getAnalytics(app)
    })
    .catch(() => {})
}

const auth = getAuth(app)
const db = getFirestore(app)

export { app, auth, db }
