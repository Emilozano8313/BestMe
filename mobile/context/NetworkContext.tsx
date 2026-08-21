/**
 * BestMe — Network Context
 * ===========================
 * Tracks connectivity and owns the one place that decides when to flush
 * the offline mutation queue: the instant NetInfo reports we're back
 * online. Screens just read `isOffline` / `pendingCount` — they don't
 * each need their own NetInfo listener.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import api from '@/services/api';
import { queueLength } from '@/services/offlineStore';

interface NetworkContextType {
  isOffline: boolean;
  pendingCount: number;
  /** Manually trigger a flush attempt, e.g. from a "reintentar" button. */
  syncNow: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType>({
  isOffline: false,
  pendingCount: 0,
  syncNow: async () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  // Avoids overlapping flush attempts if connectivity flaps quickly.
  const isFlushing = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await queueLength());
  }, []);

  const syncNow = useCallback(async () => {
    if (isFlushing.current) return;
    isFlushing.current = true;
    try {
      await api.flushQueue();
    } finally {
      isFlushing.current = false;
      await refreshPendingCount();
    }
  }, [refreshPendingCount]);

  useEffect(() => {
    void refreshPendingCount();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      if (!offline) {
        void syncNow();
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NetworkContext.Provider value={{ isOffline, pendingCount, syncNow }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
