"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import { apiClient } from "@/lib/apiClient";

export type AuthStatus = "signed-out" | "signing-in" | "signed-in";

interface SessionContextType {
  token: string | null;
  walletAddress: string | null;
  status: AuthStatus;
  authStatus: string;
  authError: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
  setSession: (token: string, walletAddress: string) => void;
  clearSession: () => void;
  setStatus: (status: AuthStatus) => void;
  clearAuthError: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const [token, setToken] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("signed-out");
  const [authStatus, setAuthStatus] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);

  const setSession = useCallback((newToken: string, newAddress: string) => {
    setToken(newToken);
    setWalletAddress(newAddress);
    setStatus("signed-in");
    setAuthStatus("");
    setAuthError(null);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setWalletAddress(null);
    setStatus("signed-out");
    setAuthStatus("");
    setAuthError(null);
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const signIn = useCallback(async () => {
    if (!address || !isConnected) {
      setAuthError("Please connect your wallet first.");
      return;
    }

    setStatus("signing-in");
    setAuthError(null);
    setAuthStatus("Requesting secure nonce from backend...");

    try {
      const nonceRes = await apiClient.getNonce(address);
      const nonce = nonceRes?.nonce;
      if (!nonce) {
        throw new Error("Invalid nonce received from authentication server.");
      }

      setAuthStatus("Please sign the authentication message in your wallet...");
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to EVault Decentralized Web-Vault",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      });

      const preparedMessage = message.prepareMessage();
      const signature = await signMessageAsync({
        message: preparedMessage,
      });

      setAuthStatus("Verifying cryptographic signature with Rust backend...");
      const verifyRes = await apiClient.verifySiwe(preparedMessage, signature);

      if (!verifyRes?.token) {
        throw new Error("No authorization token returned by backend.");
      }

      setSession(verifyRes.token, verifyRes.walletAddress || address);
    } catch (err: any) {
      let msg = err?.message || "Sign-in failed";
      if (
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("Load failed")
      ) {
        msg =
          "Cannot reach EVault backend at " +
          (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001") +
          ". Please verify the backend service is running.";
      } else if (
        msg.includes("User rejected") ||
        msg.includes("User denied") ||
        msg.includes("rejected")
      ) {
        msg = "Signature request was rejected in your wallet.";
      }
      setAuthError(msg);
      setStatus("signed-out");
      setAuthStatus("");
    }
  }, [address, isConnected, chainId, signMessageAsync, setSession]);

  // Drop SIWE session if disconnected or if connected address differs from session address
  useEffect(() => {
    if (!isConnected || !address) {
      if (token !== null || walletAddress !== null) {
        clearSession();
      }
    } else if (walletAddress && address.toLowerCase() !== walletAddress.toLowerCase()) {
      clearSession();
    }
  }, [isConnected, address, walletAddress, token, clearSession]);

  return (
    <SessionContext.Provider
      value={{
        token,
        walletAddress,
        status,
        authStatus,
        authError,
        signIn,
        signOut,
        setSession,
        clearSession,
        setStatus,
        clearAuthError,
      }}
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
