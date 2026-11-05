import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api.js';

const AuthContext = createContext(null);
const TOKEN_KEY = 'labconnect_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    window.sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('labconnect:unauthorized', handleUnauthorized);

    const token = window.sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
    } else {
      api.get('/auth/me')
        .then((response) => setUser(response.data.data.user))
        .catch(() => clearAuth())
        .finally(() => setLoading(false));
    }

    return () => window.removeEventListener('labconnect:unauthorized', handleUnauthorized);
  }, [clearAuth]);

  const login = useCallback((token, profile) => {
    window.sessionStorage.setItem(TOKEN_KEY, token);
    setUser(profile);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (window.sessionStorage.getItem(TOKEN_KEY)) await api.post('/auth/logout');
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
