import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, setAuthToken, TOKEN_KEY } from "@/src/lib/api";

type User = { user_id: string; name: string; email: string; role: string; picture?: string | null } | null;

type AuthCtx = {
  user: User;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (name: string, email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    const token = await storage.secureGet(TOKEN_KEY, "");
    if (token) {
      setAuthToken(token);
      try {
        const res = await api.me();
        setUser(res.user);
      } catch {
        await storage.secureRemove(TOKEN_KEY);
        setAuthToken(null);
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const persist = async (token: string, u: any) => {
    await storage.secureSet(TOKEN_KEY, token);
    setAuthToken(token);
    setUser(u);
  };

  const loginEmail = async (email: string, password: string) => {
    const res = await api.login({ email, password });
    await persist(res.token, res.user);
  };
  const registerEmail = async (name: string, email: string, password: string) => {
    const res = await api.register({ name, email, password });
    await persist(res.token, res.user);
  };
  const loginWithToken = async (token: string) => {
    setAuthToken(token);
    const res = await api.me();
    await persist(token, res.user);
  };
  const logout = async () => {
    try { await api.logout(); } catch {}
    await storage.secureRemove(TOKEN_KEY);
    setAuthToken(null);
    setUser(null);
  };
  const refresh = async () => {
    try {
      const res = await api.me();
      setUser(res.user);
    } catch {}
  };

  return (
    <Ctx.Provider value={{ user, loading, loginEmail, registerEmail, loginWithToken, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
