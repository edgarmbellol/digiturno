
// Import the functions you need from the SDKs you need
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics, isSupported } from "firebase/analytics";
import { getFirestore, type Firestore } from "firebase/firestore"; // Import getFirestore
import { getAuth, type Auth } from "firebase/auth"; // Import Firebase Auth

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// FOR PRODUCTION: These should be set as environment variables in your hosting environment.
// Example for .env.local or your hosting provider's environment variables:
// NEXT_PUBLIC_FIREBASE_API_KEY="your_api_key"
// NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your_auth_domain"
// NEXT_PUBLIC_FIREBASE_PROJECT_ID="your_project_id"
// NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your_storage_bucket"
// NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your_messaging_sender_id"
// NEXT_PUBLIC_FIREBASE_APP_ID="your_app_id"
// NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="your_measurement_id" (optional)

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBeiitfAFn-csRbvzBdF15XO78o_f67T28",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "digiturno-hospital.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "digiturno-hospital",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "digiturno-hospital.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1020330632521",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1020330632521:web:bc712f75ae1b9043752698",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-JCHVG3QR07" // Optional, only if you use Analytics
};

// Initialize Firebase
const app: FirebaseApp = initializeApp(firebaseConfig);
let analytics: Analytics | undefined;

if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}


// Initialize Firestore
const db: Firestore = getFirestore(app);

// Initialize Firebase Auth
const auth: Auth = getAuth(app);

// Export Firebase app, Firestore instance, and Auth instance
export { app, db, auth, analytics };
