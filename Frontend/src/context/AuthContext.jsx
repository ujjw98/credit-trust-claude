import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getActorType, setActorType, setToken, clearSession } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [actorType, setActorTypeState] = useState(getActorType());
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (type) => {
    try {
      if (type === "business") {
        const me = await api.get("/auth/me");
        setProfile(me);
      } else if (type === "retailer") {
        const me = await api.get("/retailer-auth/me");
        setProfile(me);
      } else {
        setProfile(null);
      }
    } catch {
      clearSession();
      setActorTypeState(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const type = getActorType();
    if (type) {
      loadProfile(type);
    } else {
      setLoading(false);
    }
  }, [loadProfile]);

  const login = async (type, token) => {
    setToken(token);
    setActorType(type);
    setActorTypeState(type);
    await loadProfile(type);
  };

  const logout = () => {
    clearSession();
    setActorTypeState(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ actorType, profile, loading, login, logout, reload: () => loadProfile(actorType) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
