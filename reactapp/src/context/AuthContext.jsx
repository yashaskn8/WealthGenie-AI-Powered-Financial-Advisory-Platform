/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import * as api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children, restoreOnMount = true }) {
  useSyncExternalStore(api.subscribeAuth, api.getAuthSnapshot, api.getAuthSnapshot);
  const [isInitializing, setIsInitializing] = useState(restoreOnMount);
  const token = api.getAuthToken();
  const user = api.getUserInfo();

  useEffect(() => {
    if (!restoreOnMount) return;
    const controller = new AbortController();
    api.restoreSession({ signal: controller.signal })
      .catch(error => {
        if (error?.code !== 'REQUEST_ABORTED' && error?.status !== 401) {
          console.warn('[Auth] Session restore failed:', error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsInitializing(false);
      });
    return () => controller.abort();
  }, [restoreOnMount]);

  const login = useCallback((email, password) => api.login(email, password), []);
  const register = useCallback((name, email, password, mobile) => (
    api.register(name, email, password, mobile)
  ), []);
  const logout = useCallback(() => api.logout(), []);

  const value = useMemo(() => ({
    isAuthenticated: Boolean(token || user),
    isInitializing,
    token,
    user,
    login,
    register,
    logout,
  }), [isInitializing, login, logout, register, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
