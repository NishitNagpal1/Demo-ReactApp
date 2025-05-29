import { initializeApp } from '@firebase/app';
import { initializeAuth, getReactNativePersistence } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyAiNz2DvWpe2gy-46zp-d1_0KMDPTBJhGw",
  authDomain: "twinmind-demo.firebaseapp.com",
  projectId: "twinmind-demo",
  storageBucket: "twinmind-demo.firebasestorage.app",
  messagingSenderId: "71497753587",
  appId: "1:71497753587:android:81ba33457d35e29f11a886"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});