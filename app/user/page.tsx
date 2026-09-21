"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useSignMessage, useChainId } from "wagmi";
import { SiweMessage } from "siwe";
import ConnectWallet from "@/components/ConnectWallet";
import { useSession } from "@/components/SessionContext";
import { apiClient } from "@/lib/apiClient";

// Deferred: Standalone error pages, responsive polish.

export default function UserDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { token, setSession, clearSession } = useSession();

  const [authStatus, setAuthStatus] = useState("");
  const [vaults, setVaults] = useState<any[]>([]);
  const [vaultSecrets, setVaultSecrets] = useState<Record<string, string>>({});
  const [vaultErrors, setVaultErrors] = useState<Record<string, string>>({});

  // Trigger SIWE on mount/connect if not authenticated
  useEffect(() => {
    if (isConnected && address && !token) {
      handleSignIn();
    }
    if (!isConnected) {
      clearSession();
      setAuthStatus("");
    }
  }, [isConnected, address, token]);

  // Fetch vaults when authenticated
  useEffect(() => {
    if (token) {
      apiClient.listVaults(token)
        .then(setVaults)
        .catch((err) => console.error("Failed to list vaults:", err));
    } else {
      setVaults([]);
    }
  }, [token]);

  async function handleSignIn() {
    if (!address) return;
    setAuthStatus("Fetching secure nonce...");
    try {
      const { nonce } = await apiClient.getNonce(address);

      setAuthStatus("Please sign the message in your wallet...");
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to EVault",
        uri: window.location.origin,
        version: "1",
        chainId,
        nonce,
      });

      const signature = await signMessageAsync({
        message: message.prepareMessage(),
      });

      setAuthStatus("Verifying signature...");
      const verifyRes = await apiClient.verifySiwe(message.prepareMessage(), signature);
      
      setSession(verifyRes.token, verifyRes.walletAddress);
      setAuthStatus("");
    } catch (err: any) {
      setAuthStatus(`Sign-in failed: ${err.message || "Unknown error"}`);
    }
  }

  async function handleRevealSecret(vaultId: string) {
    if (!token) return;
    try {
      const data = await apiClient.getSecret(token, vaultId);
      setVaultSecrets(prev => ({ ...prev, [vaultId]: data.secret }));
      setVaultErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[vaultId];
        return newErrs;
      });
    } catch (err: any) {
      setVaultErrors(prev => ({ ...prev, [vaultId]: err.message || "Access denied" }));
      setVaultSecrets(prev => {
        const newSecrets = { ...prev };
        delete newSecrets[vaultId];
        return newSecrets;
      });
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Header Bar */}
      <header className="mb-8 flex flex-col gap-4 border-b border-warm-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-warm-muted hover:text-amber-400 transition-colors focus-visible:outline-none"
          >
            <span>←</span> Back to Home
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-warm-text sm:text-3xl font-sans">
            Member Access Portal
          </h1>
          <p className="text-xs text-warm-muted mt-0.5">
            Unlock confidential secrets shared with your wallet address.
          </p>
        </div>
        <ConnectWallet />
      </header>

      {/* Disconnected State */}
      {!isConnected && (
        <div className="rounded-2xl border border-warm-border bg-warm-surface p-8 text-center shadow-md max-w-xl mx-auto my-8">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-warm-text">Wallet Connection Required</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Please connect your wallet to verify your identity and request access to shared vaults.
          </p>
        </div>
      )}

      {/* Authenticating State */}
      {isConnected && !token && authStatus && (
        <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 p-5 text-sm text-amber-200/90 text-center">
          <p className="animate-pulse">{authStatus}</p>
          {authStatus.includes("failed") && (
            <button onClick={handleSignIn} className="mt-4 rounded-xl border border-amber-500/50 px-4 py-2 hover:bg-amber-500/20">
              Retry Sign-In
            </button>
          )}
        </div>
      )}

      {/* Authenticated State */}
      {isConnected && token && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-warm-border bg-warm-surface p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-xl">💡</span>
              <div className="text-xs text-warm-muted leading-relaxed">
                <p className="font-bold text-warm-text mb-1">Authenticated</p>
                You are securely signed in as <span className="font-mono text-amber-300">{address}</span>.
              </div>
            </div>
          </div>

          <h2 className="text-lg font-bold text-warm-text">Your Accessible Vaults</h2>
          {vaults.length === 0 ? (
            <p className="text-warm-muted text-sm italic">No vaults found.</p>
          ) : (
            <div className="grid gap-4">
              {vaults.map((vault) => (
                <div key={vault.id} className="rounded-2xl border border-warm-border bg-warm-surface p-5 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-warm-text">{vault.name} <span className="text-warm-muted font-mono text-xs ml-2">#{vault.blockchainVaultId}</span></h3>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${vault.status === 'ACTIVE' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900' : 'bg-rose-950/50 text-rose-400 border border-rose-900'}`}>{vault.status}</span>
                  </div>
                  {vault.description && <p className="text-xs text-warm-muted mb-4">{vault.description}</p>}
                  
                  <div className="flex items-center gap-2 mb-4">
                     <button
                        onClick={() => handleRevealSecret(vault.id)}
                        className="rounded-xl bg-warm-accent px-4 py-2 text-xs font-bold text-stone-950 hover:bg-amber-500 transition-all"
                      >
                        Reveal Secret
                      </button>
                  </div>

                  {vaultErrors[vault.id] && (
                     <div className="mt-3 rounded-xl p-3.5 text-xs bg-rose-950/30 border border-rose-800/40 text-rose-300 font-mono">
                        Error: {vaultErrors[vault.id]}
                     </div>
                  )}

                  {vaultSecrets[vault.id] && (
                    <div className="mt-3 rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 shadow-inner">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                          <span>🔓</span> Decrypted Secret Content
                        </p>
                      </div>
                      <div className="rounded-xl bg-warm-bg border border-warm-border p-3 font-mono text-sm text-warm-text select-all break-all shadow-sm">
                        {vaultSecrets[vault.id]}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
