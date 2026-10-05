"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchHealth } from "@/lib/api";

const HealthContext = createContext({ status: "checking", health: null, refresh: () => {} });

export function HealthProvider({ children }) {
  const [state, setState] = useState({ status: "checking", health: null });

  const refresh = useCallback(async () => {
    try {
      const health = await fetchHealth();
      setState({ status: "online", health });
    } catch (err) {
      setState((s) => ({
        status: err.status === 401 ? "unauthorized" : "offline",
        health: s.health,
      }));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20000);
    return () => clearInterval(timer);
  }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export const useHealth = () => useContext(HealthContext);
