// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDrAhZosJCgo6wWyBsN5lMpGLZXsxc9weY",
  authDomain: "card-game-tracker-1f5dd.firebaseapp.com",
  databaseURL: "https://card-game-tracker-1f5dd-default-rtdb.firebaseio.com",
  projectId: "card-game-tracker-1f5dd",
  storageBucket: "card-game-tracker-1f5dd.firebasestorage.app",
  messagingSenderId: "814317215030",
  appId: "1:814317215030:web:32aa794c2e13d59efc2797",
  measurementId: "G-610H3Z4XQJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and get a reference to the service
export const database = getDatabase(app);
