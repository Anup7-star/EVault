"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import Navbar from "@/components/Navbar";
import { useSession } from "@/components/SessionContext";
import { apiClient } from "@/lib/apiClient";

export default function UserDashboard() {
  const { address, isConnected } = useAccount();
  const { token, status: sessionAuthStatus, authStatus, authError, signIn, clearSession } = useSession();

  const [vaults, setVaults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);

  const [vaultSecrets, setVaultSecrets] = useState<Record<string, string>>({});
  const [vaultErrors, setVaultErrors] = useState<Record<string, string>>({});
  const [revealingMap, setRevealingMap] = useState<Record<string, boolean>>({});
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});
  const [maskedMap, setMaskedMap] = useState<Record<string, boolean>>({});

  // Trigger SIWE on mount/connect if not authenticated
  useEffect(() => {
    if (isConnected && address && !token && sessionAuthStatus === "signed-out" && !authError) {
      signIn();
    }
  }, [isConnected, address, token, sessionAuthStatus, authError, signIn]);

  // Fetch vaults when authenticated
  useEffect(() => {
    if (token) {
      loadVaults();
    } else {
      setVaults([]);
      setVaultSecrets({});
      setVaultErrors({});
      setListError(null);
    }
  }, [token]);

  async function loadVaults() {
    if (!token) return;
    setIsLoadingList(true);
    setListError(null);
    try {
      const data = await apiClient.listVaults(token);
      setVaults(data || []);
      setListError(null);
    } catch (err: any) {
      console.error("Failed to list vaults:", err);
      setVaults([]);
      setListError(err.message || "An unexpected error occurred while fetching accessible vaults.");
    } finally {
      setIsLoadingList(false);
    }
  }

  async function handleRevealSecret(vaultId: string) {
    if (!token) return;
    setRevealingMap((prev) => ({ ...prev, [vaultId]: true }));
    try {
      const data = await apiClient.getSecret(token, vaultId);
      setVaultSecrets((prev) => ({ ...prev, [vaultId]: data.secret }));
      setVaultErrors((prev) => {
        const newErrs = { ...prev };
        delete newErrs[vaultId];
        return newErrs;
      });
    } catch (err: any) {
      const baseMsg = err.message || "Access denied";
      const displayMsg = baseMsg.includes("Access denied or expired")
        ? `${baseMsg}. If this is your own vault, grant your own wallet access first in the Admin Console.`
        : baseMsg;
      setVaultErrors((prev) => ({ ...prev, [vaultId]: displayMsg }));
      setVaultSecrets((prev) => {
        const newSecrets = { ...prev };
        delete newSecrets[vaultId];
        return newSecrets;
      });
    } finally {
      setRevealingMap((prev) => ({ ...prev, [vaultId]: false }));
    }
  }

  function handleCopySecret(vaultId: string, secretText: string) {
    navigator.clipboard.writeText(secretText);
    setCopiedMap((prev) => ({ ...prev, [vaultId]: true }));
    setTimeout(() => {
      setCopiedMap((prev) => ({ ...prev, [vaultId]: false }));
    }, 2000);
  }

  function toggleMask(vaultId: string) {
    setMaskedMap((prev) => ({ ...prev, [vaultId]: !prev[vaultId] }));
  }

  const filteredVaults = vaults.filter((v) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.name?.toLowerCase().includes(q) ||
      v.description?.toLowerCase().includes(q) ||
      String(v.blockchainVaultId)?.includes(q) ||
      v.id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen flex flex-col bg-vault-bg text-vault-text selection:bg-amber-500/30 selection:text-amber-200">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-vault-border/80 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors"
              >
                ← Overview
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-xs font-mono text-amber-400 font-semibold">Member Portal</span>
            </div>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-sans">
              Decrypted Secret Access
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Live on-chain permission verification and fail-closed secret decryption.
            </p>
          </div>

          {isConnected && token && (
            <button
              onClick={loadVaults}
              disabled={isLoadingList}
              className="inline-flex items-center gap-2 rounded-xl border border-vault-border bg-vault-surface px-4 py-2 text-xs font-semibold text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition-all self-start sm:self-auto disabled:opacity-50"
            >
              <span className={isLoadingList ? "animate-spin" : ""}>🔄</span>
              <span>{isLoadingList ? "Refreshing..." : "Refresh Vaults"}</span>
            </button>
          )}
        </div>

        {/* Disconnected State */}
        {!isConnected && (
          <div className="rounded-2xl border border-vault-border bg-vault-surface p-10 text-center shadow-xl max-w-xl mx-auto my-12 space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Wallet Connection Required</h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
              Please connect your Web3 wallet (e.g. MetaMask) to verify your grantee permissions and decrypt confidential secrets.
            </p>
          </div>
        )}

        {/* Authenticating State or Sign-In Card */}
        {isConnected && !token && (
          <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-amber-950/40 to-vault-surface/90 p-8 text-center max-w-xl mx-auto shadow-xl space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              🔑
            </div>
            <h2 className="text-lg font-bold text-white">Member SIWE Authentication Required</h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Sign an EIP-4361 authentication challenge with wallet{" "}
              <span className="font-mono text-amber-300 bg-black/40 px-1.5 py-0.5 rounded">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
              </span>{" "}
              to view your shared vaults and decrypt secrets.
            </p>

            {authStatus && (
              <p className="animate-pulse font-mono text-xs text-amber-300">{authStatus}</p>
            )}

            {authError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300 font-mono text-left">
                {authError}
              </div>
            )}

            <button
              onClick={signIn}
              disabled={sessionAuthStatus === "signing-in"}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 text-xs sm:text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-orange-500 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
            >
              {sessionAuthStatus === "signing-in" ? (
                <>
                  <span className="animate-spin text-sm">🔄</span>
                  <span>Signing In with Ethereum...</span>
                </>
              ) : (
                <>
                  <span>✍️</span>
                  <span>Sign In with Ethereum</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Authenticated State */}
        {isConnected && token && (
          <div className="space-y-6">
            {/* Identity & Session Bar */}
            <div className="rounded-2xl border border-vault-border bg-vault-card p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 text-lg border border-emerald-500/20">
                  🛡️
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Cryptographic SIWE Session Active</span>
                  <span className="font-mono text-xs text-amber-300 break-all">{address}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Session Verified
                </span>
              </div>
            </div>

            {/* Search Filter Strip */}
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
                <input
                  type="text"
                  placeholder="Search accessible vaults by name, chain ID, or UUID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-vault-border bg-vault-surface pl-9 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 transition-all font-mono"
                />
              </div>
              <span className="text-xs text-slate-400 font-mono whitespace-nowrap">
                {filteredVaults.length} {filteredVaults.length === 1 ? "Vault" : "Vaults"}
              </span>
            </div>

            {/* List Error Banner */}
            {listError && (
              <div className="rounded-xl p-4 text-xs bg-rose-950/30 border border-rose-800/40 text-rose-300 font-mono">
                Error loading vaults from backend: {listError}
              </div>
            )}

            {/* Vaults Grid */}
            {filteredVaults.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-vault-border bg-vault-surface/40 p-12 text-center space-y-3">
                <div className="text-3xl">📭</div>
                <h3 className="font-bold text-white text-base">No Shared Vaults Found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  No vaults are currently registered or granted to wallet address{" "}
                  <span className="font-mono text-amber-300">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "your wallet"}</span>.
                </p>
                <div className="pt-2">
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300"
                  >
                    <span>Go to Admin Console to create or grant a vault</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-5">
                {filteredVaults.map((vault) => {
                  const isRevealing = revealingMap[vault.id] || false;
                  const secret = vaultSecrets[vault.id];
                  const error = vaultErrors[vault.id];
                  const isCopied = copiedMap[vault.id] || false;
                  const isMasked = maskedMap[vault.id] || false;

                  return (
                    <div
                      key={vault.id}
                      className="rounded-2xl border border-vault-border bg-vault-card p-6 shadow-md transition-all hover:border-slate-700 space-y-4"
                    >
                      {/* Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                            🔒
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-bold text-white">{vault.name}</h3>
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-black/40 text-slate-400 border border-vault-border">
                                #{vault.blockchainVaultId}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-500">
                              UUID: {vault.id}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`self-start sm:self-auto text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                            vault.status === "ACTIVE"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {vault.status}
                        </span>
                      </div>

                      {/* Description & Storage Ref */}
                      {vault.description && (
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {vault.description}
                        </p>
                      )}

                      {/* Action Bar */}
                      <div className="pt-2 flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => handleRevealSecret(vault.id)}
                          disabled={isRevealing}
                          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-xs font-bold text-slate-950 hover:from-amber-400 hover:to-orange-500 transition-all shadow-md shadow-amber-950/20 disabled:opacity-50 active:scale-[0.98]"
                        >
                          {isRevealing ? (
                            <>
                              <span className="animate-spin">🔄</span>
                              <span>Checking Blockchain Access...</span>
                            </>
                          ) : (
                            <>
                              <span>🔓</span>
                              <span>Reveal Secret</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Error Box */}
                      {error && (
                        <div className="rounded-xl p-4 text-xs bg-rose-950/30 border border-rose-800/40 text-rose-300 font-mono leading-relaxed space-y-1">
                          <p className="font-bold flex items-center gap-1.5">
                            <span>🚫</span> Access Denied
                          </p>
                          <p>{error}</p>
                        </div>
                      )}

                      {/* Decrypted Secret Reveal Box */}
                      {secret && (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 shadow-inner space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 font-mono">
                              <span>🔓</span> Hardware-Decrypted Secret
                            </span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => toggleMask(vault.id)}
                                className="text-xs font-mono text-emerald-300 hover:text-white"
                              >
                                {isMasked ? "Show Plaintext" : "Mask Content"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopySecret(vault.id, secret)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:text-emerald-200"
                              >
                                <span>{isCopied ? "✓ Copied!" : "📋 Copy"}</span>
                              </button>
                            </div>
                          </div>

                          <div
                            className="rounded-lg bg-black/60 border border-emerald-500/20 p-3 font-mono text-sm text-emerald-200 break-all select-all shadow-sm"
                            style={{ WebkitTextSecurity: isMasked ? "disc" : "none" } as any}
                          >
                            {secret}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
