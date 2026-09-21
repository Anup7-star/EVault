"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type AuthStatus = "signed-out" | "signing-in" | "signed-in";

interface SessionContextType {
  token: string | null;
  walletAddress: string | null;
  status: AuthStatus;
  setSession: (token: string, walletAddress: string) => void;
  clearSession: () => void;
  setStatus: (status: AuthStatus) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("signed-out");

  const setSession = (newToken: string, newAddress: string) => {
    setToken(newToken);
    setWalletAddress(newAddress);
    setStatus("signed-in");
  };

  const clearSession = () => {
    setToken(null);
    setWalletAddress(null);
    setStatus("signed-out");
  };

  return (
    <SessionContext.Provider
      value={{ token, walletAddress, status, setSession, clearSession, setStatus }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
