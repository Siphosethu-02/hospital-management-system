// src/context/AuthContext.jsx
// Firebase Auth version. The old implementation polled a refresh-token
// cookie on mount; Firebase Auth instead persists its own session
// (IndexedDB) and notifies via onAuthStateChanged whenever it's
// restored, changes, or clears - so that listener IS the source of
// truth here, not a manual API call on mount.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { authService, buildUserProfile } from '../services/auth.service';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fires once immediately with whatever session Firebase already
    // has restored from IndexedDB (or null), then again on every
    // future sign-in/sign-out - this single listener replaces the old
    // mount-time refresh() call entirely.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      try {
        const profile = await buildUserProfile(firebaseUser.uid);
        if (profile.isActive === false) {
          await authService.logout();
          setUser(null);
        } else {
          setUser(profile);
        }
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const login = useCallback(async (email, password, rememberMe) => {
    const { data } = await authService.login(email, password, rememberMe);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    const { data } = await authService.me();
    setUser(data);
    return data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshCurrentUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
