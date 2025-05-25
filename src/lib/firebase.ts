
// Import the functions you need from the SDKs you need
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getFirestore, type Firestore } from "firebase/firestore"; // Import getFirestore
import { getAuth, type Auth } from "firebase/auth"; // Import Firebase Auth

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBeiitfAFn-csRbvzBdF15XO78o_f67T28",
  authDomain: "digiturno-hospital.firebaseapp.com",
  projectId: "digiturno-hospital",
  storageBucket: "digiturno-hospital.appspot.com", 
  messagingSenderId: "1020330632521",
  appId: "1:1020330632521:web:bc712f75ae1b9043752698",
  measurementId: "G-JCHVG3QR07"
};

// Initialize Firebase
const app: FirebaseApp = initializeApp(firebaseConfig);
let analytics: Analytics | undefined;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// Initialize Firestore
const db: Firestore = getFirestore(app);

// Initialize Firebase Auth
const auth: Auth = getAuth(app);

// Export Firebase app, Firestore instance, and Auth instance
export { app, db, auth, analytics };

