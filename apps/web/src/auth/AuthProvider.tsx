import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthResult } from '@chat/shared';
import { SESSION_KEY } from '../services/api';

interface AuthContextValue {
  session: AuthResult | null;
  signIn: (session: AuthResult) => void;
  signOut: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): AuthResult | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as AuthResult | null;
    return value?.accessToken && value.user?.id ? value : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(readSession);
  const signOut = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);
  const signIn = useCallback((value: AuthResult) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    setSession(value);
  }, []);
  useEffect(() => {
    window.addEventListener('auth:expired', signOut);
    return () => window.removeEventListener('auth:expired', signOut);
  }, [signOut]);
  return (
    <AuthContext.Provider value={{ session, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider 未初始化');
  return context;
}
