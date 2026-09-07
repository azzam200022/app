import { Platform } from "react-native";
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence, GoogleAuthProvider, type Auth } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyD9RQqKgswaufdialaKgYy2zHAFVKIiviU",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "azzam-c1067.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "azzam-c1067",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "azzam-c1067.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "71553026032",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:71553026032:web:19706da78cf3ff872b3f35",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

let firebaseAuth: Auth;
if (Platform.OS === "web") {
  firebaseAuth = getAuth(firebaseApp);
} else {
  try {
    firebaseAuth = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    firebaseAuth = getAuth(firebaseApp);
  }
}

export { firebaseAuth };
export const googleProvider = new GoogleAuthProvider();
