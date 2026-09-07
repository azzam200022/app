import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { firebaseAuth, googleProvider } from "@/src/lib/firebase";
import { storage } from "@/src/utils/storage";
import { api, setAuthToken, TOKEN_KEY } from "@/src/lib/api";

type User = { user_id: string; name: string; email: string; role: string; picture?: string | null } | null;

type AuthCtx = {
  user: User;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (name: string, email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  loginGoogleWithIdToken: (idToken: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

function firebaseMessage(error: any): string {
  const messages: Record<string, string> = {
    "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة",
    "auth/invalid-email": "البريد الإلكتروني غير صحيح",
    "auth/email-already-in-use": "البريد الإلكتروني مستخدم مسبقاً",
    "auth/weak-password": "كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل",
    "auth/popup-closed-by-user": "تم إغلاق نافذة تسجيل الدخول",
    "auth/account-exists-with-different-credential": "هذا البريد مرتبط بطريقة دخول أخرى",
  };
  return messages[error?.code] || error?.message || "تعذر تسجيل الدخول";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = async () => {
    await storage.secureRemove(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
  };

  const syncFirebaseUser = async (firebaseUser: any) => {
    const token = await firebaseUser.getIdToken();
    await storage.secureSet(TOKEN_KEY, token);
    setAuthToken(token);
    const res = await api.me();
    setUser(res.user);
  };

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          await syncFirebaseUser(firebaseUser);
          return;
        }
        const legacyToken = await storage.secureGet(TOKEN_KEY, "");
        if (legacyToken) {
          setAuthToken(legacyToken);
          const res = await api.me();
          setUser(res.user);
        } else {
          await clearSession();
        }
      } catch {
        await clearSession();
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const loginEmail = async (email: string, password: string) => {
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      await syncFirebaseUser(credential.user);
    } catch (error) {
      throw new Error(firebaseMessage(error));
    }
  };

  const registerEmail = async (name: string, email: string, password: string) => {
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await credential.user.getIdToken(true);
      await syncFirebaseUser(credential.user);
    } catch (error) {
      throw new Error(firebaseMessage(error));
    }
  };

  const finishGoogleLogin = async (credential: any) => {
    try {
      await syncFirebaseUser(credential.user);
    } catch (error) {
      throw new Error(firebaseMessage(error));
    }
  };

  const loginGoogle = async () => {
    if (Platform.OS !== "web") {
      throw new Error("استخدم إعداد Google في التطبيق لإكمال الدخول");
    }
    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      await finishGoogleLogin(credential);
    } catch (error) {
      throw new Error(firebaseMessage(error));
    }
  };

  const loginGoogleWithIdToken = async (idToken: string) => {
    try {
      const credential = await signInWithCredential(
        firebaseAuth,
        GoogleAuthProvider.credential(idToken),
      );
      await finishGoogleLogin(credential);
    } catch (error) {
      throw new Error(firebaseMessage(error));
    }
  };

  const loginWithToken = async (token: string) => {
    setAuthToken(token);
    const res = await api.me();
    await storage.secureSet(TOKEN_KEY, token);
    setUser(res.user);
  };

  const logout = async () => {
    try { await signOut(firebaseAuth); } catch {}
    await clearSession();
  };

  const refresh = async () => {
    try {
      const res = await api.me();
      setUser(res.user);
    } catch {}
  };

  return (
    <Ctx.Provider value={{ user, loading, loginEmail, registerEmail, loginGoogle, loginGoogleWithIdToken, loginWithToken, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
