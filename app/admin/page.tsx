"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, usePublicClient, useChainId, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import Navbar from "@/components/Navbar";
import { useSession } from "@/components/SessionContext";
import { apiClient } from "@/lib/apiClient";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";

function toDateTimeLocalString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function mapAuditAction(action: string): string {
  switch (action) {
    case "VAULT_CREATED":
      return "Vault created";
    case "ACCESS_GRANTED":
      return "Access granted";
    case "SECRET_RETRIEVED":
      return "Secret revealed";
    case "ACCESS_REVOKED":
      return "Access revoked";
    case "AUTH_SUCCESS":
      return "Sign-in successful";
    case "AUTH_FAILURE":
      return "Sign-in failed";
    case "ACCESS_DENIED":
      return "Access denied";
    case "DECRYPTION_FAILURE":
      return "Decryption failed";
    default:
      return action.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  }
}

function formatMetadata(metadata: any): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const parts: string[] = [];
  if (metadata.grantee) {
    const g = String(metadata.grantee);
    parts.push(`Grantee: ${g.slice(0, 6)}...${g.slice(-4)}`);
  }
  if (metadata.revoked_wallet) {
    const r = String(metadata.revoked_wallet);
    parts.push(`Revoked: ${r.slice(0, 6)}...${r.slice(-4)}`);
  }
  if (metadata.role !== undefined) {
    parts.push(`Role: ${metadata.role === 2 ? "Viewer (2)" : metadata.role}`);
  }
  if (metadata.expires_at) {
    try {
      parts.push(`Expires: ${new Date(metadata.expires_at).toLocaleString()}`);
    } catch (_) {
      parts.push(`Expires: ${metadata.expires_at}`);
    }
  }
  if (metadata.blockchain_vault_id !== undefined) {
    parts.push(`Chain Vault #${metadata.blockchain_vault_id}`);
  }
  return parts.length > 0 ? parts.join(" • ") : null;
}

export default function AdminDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { token, status: sessionAuthStatus, authStatus, authError, signIn, clearSession } = useSession();

  const [activeTab, setActiveTab] = useState<"create" | "grant" | "revoke" | "audit">("create");

  // Create Vault Form State
  const [vaultName, setVaultName] = useState("");
  const [vaultDescription, setVaultDescription] = useState("");
  const [vaultStorageRef, setVaultStorageRef] = useState("s3://default-bucket/ref");
  const [vaultSecret, setVaultSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<string>("");
  const [lastVaultId, setLastVaultId] = useState<string>("");
  const [copiedUuid, setCopiedUuid] = useState(false);

  // Grant Form State
  const [grantVaultId, setGrantVaultId] = useState("");
  const [grantWallet, setGrantWallet] = useState("");
  const [grantExpiry, setGrantExpiry] = useState(() => {
    return toDateTimeLocalString(new Date(Date.now() + 24 * 60 * 60 * 1000));
  });
  const [grantStatus, setGrantStatus] = useState<string>("");

  // Revoke Form State
  const [revokeVaultId, setRevokeVaultId] = useState("");
  const [revokeWallet, setRevokeWallet] = useState("");
  const [revokeStatus, setRevokeStatus] = useState<string>("");

  // Audit Logs & Permissions State
  const [permissions, setPermissions] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLogsStatus, setAuditLogsStatus] = useState<string>("");
  const [activeVaultId, setActiveVaultId] = useState<string>("");

  // Recent vaults tracker in memory for quick selection
  const [recentVaults, setRecentVaults] = useState<Array<{ id: string; name: string; blockchainId?: string }>>([]);

  const contractReady = CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

  // Trigger SIWE on mount/connect if not authenticated
  useEffect(() => {
    if (isConnected && address && !token && sessionAuthStatus === "signed-out" && !authError) {
      signIn();
    }
  }, [isConnected, address, token, sessionAuthStatus, authError, signIn]);

  // Reset session-derived states when token becomes null
  useEffect(() => {
    if (!token) {
      setPermissions([]);
      setAuditLogs([]);
      setAuditLogsStatus("");
      setActiveVaultId("");
      setLastVaultId("");
      setRegisterStatus("");
      setGrantStatus("");
      setRevokeStatus("");
      setRecentVaults([]);
    }
  }, [token]);

  async function handleRegisterVault(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !token) return;
    setRegisterStatus("Submitting vault registration to the blockchain...");
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "createVault",
        args: [vaultName],
      });
      setRegisterStatus("Transaction sent! Waiting for blockchain confirmation...");
      await publicClient.waitForTransactionReceipt({ hash });

      const count = (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "getVaultCount",
      })) as bigint;
      const blockchainVaultId = (count - 1n).toString();

      setRegisterStatus(`Blockchain confirmed Vault #${blockchainVaultId}. Encrypting & syncing with backend...`);

      const res = await apiClient.createVault(token, {
        blockchainVaultId: Number(blockchainVaultId),
        name: vaultName,
        description: vaultDescription,
        storageReference: vaultStorageRef,
        secret: vaultSecret,
      });

      setLastVaultId(res.id);
      setGrantVaultId(res.id);
      setRevokeVaultId(res.id);
      setRecentVaults((prev) => [{ id: res.id, name: vaultName, blockchainId: blockchainVaultId }, ...prev]);
      setRegisterStatus(`Success! Vault created on-chain (#${blockchainVaultId}) and encrypted in backend (UUID: ${res.id}).`);
      setVaultName("");
      setVaultDescription("");
      setVaultSecret("");
      loadVaultActivity(res.id);
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "An unexpected issue occurred.";
      setRegisterStatus(`Registration couldn't be completed: ${errorMsg}`);
    }
  }

  async function handleGrantAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !token) return;

    const trimmedVaultId = grantVaultId.trim();
    const trimmedWallet = grantWallet.trim();

    if (!trimmedVaultId) {
      setGrantStatus("Permission grant couldn't be completed: Vault UUID is required.");
      return;
    }

    if (!trimmedWallet) {
      setGrantStatus("Permission grant couldn't be completed: Team Member Wallet Address is required.");
      return;
    }

    const expiryMs = new Date(grantExpiry).getTime();
    const nowMs = Date.now();
    if (isNaN(expiryMs) || expiryMs < nowMs + 2 * 60 * 1000) {
      setGrantStatus("Expiry must be at least 2 minutes in the future.");
      return;
    }

    setGrantStatus("Submitting access permission to the blockchain...");
    try {
      const expiryTimestamp = BigInt(Math.floor(expiryMs / 1000));
      const vault = await apiClient.getVault(token, trimmedVaultId);

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "grantAccess",
        args: [BigInt(vault.blockchainVaultId), trimmedWallet as `0x${string}`, 2, expiryTimestamp],
      });
      setGrantStatus("Transaction sent! Confirming permission on-chain...");
      await publicClient.waitForTransactionReceipt({ hash });

      setGrantStatus("On-chain grant confirmed! Syncing with backend projection...");
      await apiClient.grantPermission(token, trimmedVaultId, {
        walletAddress: trimmedWallet,
        role: 2,
        expiresAt: new Date(grantExpiry).toISOString(),
      });

      setGrantStatus(`Success! Granted access for Vault to ${trimmedWallet.slice(0, 6)}...${trimmedWallet.slice(-4)}.`);
      loadVaultActivity(trimmedVaultId);
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "An unexpected issue occurred.";
      setGrantStatus(`Permission grant couldn't be completed: ${errorMsg}`);
    }
  }

  async function handleRevokeAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !token) return;

    const trimmedVaultId = revokeVaultId.trim();
    const trimmedWallet = revokeWallet.trim();

    if (!trimmedVaultId) {
      setRevokeStatus("Revocation couldn't be completed: Vault UUID is required.");
      return;
    }

    if (!trimmedWallet) {
      setRevokeStatus("Revocation couldn't be completed: Team Member Wallet Address is required.");
      return;
    }

    setRevokeStatus("Submitting access revocation to the blockchain...");
    try {
      const vault = await apiClient.getVault(token, trimmedVaultId);

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "revokeAccess",
        args: [BigInt(vault.blockchainVaultId), trimmedWallet as `0x${string}`],
      });
      setRevokeStatus("Transaction sent! Confirming revocation on-chain...");
      await publicClient.waitForTransactionReceipt({ hash });

      setRevokeStatus("On-chain revoke confirmed! Syncing with backend...");
      await apiClient.revokePermission(token, trimmedVaultId, trimmedWallet);

      setRevokeStatus(`Success! Access revoked on-chain.`);
      loadVaultActivity(trimmedVaultId);
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "An unexpected issue occurred.";
      setRevokeStatus(`Revocation couldn't be completed: ${errorMsg}`);
    }
  }

  async function loadVaultActivity(vaultId: string) {
    if (!token) return;
    const trimmed = vaultId.trim();
    setActiveVaultId(trimmed);
    if (!trimmed) {
      setPermissions([]);
      setAuditLogs([]);
      setAuditLogsStatus("");
      return;
    }

    try {
      const perms = await apiClient.listPermissions(token, trimmed);
      setPermissions(perms);
    } catch {
      setPermissions([]);
    }

    setAuditLogsStatus("Loading activity logs from PostgreSQL...");
    try {
      const logs = await apiClient.getAuditLogs(token, trimmed);
      setAuditLogs(logs);
      setAuditLogsStatus("");
    } catch (err: any) {
      const errorMsg = err.message || "Failed to load activity logs";
      setAuditLogs([]);
      setAuditLogsStatus(errorMsg);
    }
  }

  function handleSelectRecentVault(id: string) {
    setGrantVaultId(id);
    setRevokeVaultId(id);
    loadVaultActivity(id);
  }

  function copyLastUuid() {
    if (!lastVaultId) return;
    navigator.clipboard.writeText(lastVaultId);
    setCopiedUuid(true);
    setTimeout(() => setCopiedUuid(false), 2000);
  }

  return (
    <div className="min-h-screen flex flex-col bg-vault-bg text-vault-text selection:bg-cyan-500/30 selection:text-cyan-200">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        {/* Page Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-vault-border/80 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
              >
                ← Overview
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-xs font-mono text-cyan-400 font-semibold">Admin Console</span>
            </div>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-sans">
              Vault Management &amp; Access Governance
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Create encrypted vaults, issue time-bound member permissions on-chain, and audit access events.
            </p>
          </div>

          {/* Quick Stats or Chain indicator */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-vault-border bg-vault-surface text-xs font-mono text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Chain ID {chainId || "---"}</span>
            </span>
          </div>
        </div>

        {/* Wallet Disconnected Warning */}
        {!isConnected && (
          <div className="rounded-2xl border border-vault-border bg-vault-surface p-10 text-center shadow-xl max-w-xl mx-auto my-12 space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Owner Wallet Connection Required</h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
              Connect your authorized Web3 administrator wallet to deploy contracts, issue permission grants, and view activity logs.
            </p>
          </div>
        )}

        {/* Authenticating SIWE banner or sign-in card */}
        {isConnected && !token && (
          <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-b from-cyan-950/40 to-vault-surface/90 p-8 text-center max-w-xl mx-auto shadow-xl space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              ✍️
            </div>
            <h2 className="text-lg font-bold text-white">Administrator SIWE Authentication Required</h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Sign an EIP-4361 authentication challenge with wallet{" "}
              <span className="font-mono text-cyan-300 bg-black/40 px-1.5 py-0.5 rounded">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
              </span>{" "}
              to unlock the Admin Console.
            </p>

            {authStatus && (
              <p className="animate-pulse font-mono text-xs text-cyan-300">{authStatus}</p>
            )}

            {authError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300 font-mono text-left">
                {authError}
              </div>
            )}

            <button
              onClick={signIn}
              disabled={sessionAuthStatus === "signing-in"}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
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

        {/* Smart Contract check warning */}
        {isConnected && !contractReady && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-5 text-xs text-amber-200/90 flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="space-y-1">
              <p className="font-bold text-amber-200 text-sm">Smart Contract Not Configured</p>
              <p className="text-slate-300 leading-relaxed">
                The vault registry contract has not been detected at <code className="font-mono bg-black/40 px-1.5 py-0.5 rounded text-amber-300">{CONTRACT_ADDRESS}</code>. Run <code className="font-mono bg-black/40 px-1.5 py-0.5 rounded text-amber-300">npm run deploy:local</code> or configure Arbitrum Sepolia in your environment.
              </p>
            </div>
          </div>
        )}

        {/* Main Dashboard Area */}
        {isConnected && token && contractReady && (
          <div className="space-y-6">
            {/* Quick Vault Selector Strip if any vaults created in this session */}
            {recentVaults.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto p-3 rounded-xl border border-vault-border bg-vault-surface/60 text-xs">
                <span className="font-semibold text-slate-400 whitespace-nowrap">Recent Vaults:</span>
                {recentVaults.map((rv) => (
                  <button
                    key={rv.id}
                    onClick={() => handleSelectRecentVault(rv.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border font-mono transition-all whitespace-nowrap ${
                      activeVaultId === rv.id
                        ? "border-cyan-500 bg-cyan-500/15 text-cyan-300 font-bold"
                        : "border-vault-border bg-vault-card text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    <span>🔒 {rv.name}</span>
                    <span className="text-[10px] text-slate-500">({rv.id.slice(0, 6)}...)</span>
                  </button>
                ))}
              </div>
            )}

            {/* Dashboard Tabs Header */}
            <div className="flex border-b border-vault-border/80 gap-2">
              <button
                onClick={() => setActiveTab("create")}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
                  activeTab === "create"
                    ? "border-cyan-400 text-cyan-400"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                <span>🔒</span>
                <span>Create Vault</span>
              </button>
              <button
                onClick={() => setActiveTab("grant")}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
                  activeTab === "grant"
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                <span>🤝</span>
                <span>Grant Access</span>
              </button>
              <button
                onClick={() => setActiveTab("revoke")}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
                  activeTab === "revoke"
                    ? "border-rose-400 text-rose-400"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                <span>🚫</span>
                <span>Revoke Access</span>
              </button>
              <button
                onClick={() => setActiveTab("audit")}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all ${
                  activeTab === "audit"
                    ? "border-purple-400 text-purple-400"
                    : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                <span>📜</span>
                <span>Audit Trail &amp; Permissions</span>
                {auditLogs.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-mono">
                    {auditLogs.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab 1: Create Vault */}
            {activeTab === "create" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <section className="lg:col-span-8 rounded-2xl border border-vault-border bg-vault-card p-6 sm:p-8 shadow-xl space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 text-base">
                        🔒
                      </span>
                      Create &amp; Encrypt New Vault
                    </h2>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                      Metadata is registered immutably on-chain via Solidity smart contract. The secret payload is encrypted with unique 96-bit nonces using AES-256-GCM.
                    </p>
                  </div>

                  <form onSubmit={handleRegisterVault} className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1.5 uppercase tracking-wider font-mono">
                        Vault Name
                      </label>
                      <input
                        className="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-white placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 transition-all"
                        placeholder="e.g. Production Cluster Credentials"
                        value={vaultName}
                        onChange={(e) => setVaultName(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1.5 uppercase tracking-wider font-mono">
                        Description (Optional)
                      </label>
                      <input
                        className="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-white placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 transition-all"
                        placeholder="Short summary of this confidential credential"
                        value={vaultDescription}
                        onChange={(e) => setVaultDescription(e.target.value)}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                          Confidential Secret Content
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowSecret(!showSecret)}
                          className="text-xs text-cyan-400 hover:text-cyan-300 font-mono"
                        >
                          {showSecret ? "Mask Secret" : "Reveal Input"}
                        </button>
                      </div>
                      <textarea
                        className="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-white placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 font-mono transition-all"
                        placeholder="Paste private key, API token, or secret password..."
                        value={vaultSecret}
                        onChange={(e) => setVaultSecret(e.target.value)}
                        rows={4}
                        required
                        style={{ WebkitTextSecurity: showSecret ? "none" : "disc" } as any}
                      />
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Hardware-encrypted with AES-256-GCM before database write.
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3.5 text-xs sm:text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20 active:scale-[0.99] focus-visible:outline-none"
                    >
                      Deploy On-Chain &amp; Secure Vault
                    </button>

                    {registerStatus && (
                      <div
                        className={`rounded-xl p-3.5 text-xs font-mono border leading-relaxed ${
                          registerStatus.includes("Error") || registerStatus.includes("couldn't")
                            ? "bg-rose-950/30 border-rose-800/40 text-rose-300"
                            : registerStatus.includes("Success")
                            ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                            : "bg-vault-surface border-vault-border text-slate-300"
                        }`}
                      >
                        {registerStatus}
                      </div>
                    )}

                    {lastVaultId && (
                      <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                            <span>✨</span> Vault Created Successfully!
                          </span>
                          <button
                            type="button"
                            onClick={copyLastUuid}
                            className="text-xs font-bold text-cyan-400 hover:text-cyan-200"
                          >
                            {copiedUuid ? "Copied!" : "Copy UUID"}
                          </button>
                        </div>
                        <p className="font-mono text-xs text-white bg-black/40 p-2.5 rounded border border-cyan-500/20 break-all select-all">
                          {lastVaultId}
                        </p>
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab("grant");
                              setGrantVaultId(lastVaultId);
                            }}
                            className="text-xs font-bold text-emerald-400 hover:underline"
                          >
                            Grant Member Access Now →
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                </section>

                {/* Right info column */}
                <div className="lg:col-span-4 space-y-5 text-xs">
                  <div className="rounded-2xl border border-vault-border bg-vault-surface p-6 space-y-3">
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                      <span>💡</span> Owner Self-Grant Notice
                    </h3>
                    <p className="text-slate-400 leading-relaxed">
                      By design, EVault enforces strict zero-trust: even the vault creator cannot decrypt secret content without an explicit on-chain grant.
                    </p>
                    <p className="text-slate-400 leading-relaxed">
                      To decrypt your own vault later, remember to grant your own wallet address via the Grant Access tab.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-vault-border bg-vault-surface p-6 space-y-3">
                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                      <span>🛡️</span> Cryptographic Lifecycle
                    </h3>
                    <div className="space-y-2 text-slate-400">
                      <div className="flex items-start gap-2">
                        <span className="text-cyan-400 font-bold">1.</span>
                        <span>Solidity smart contract assigns unique sequential on-chain vault ID.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-cyan-400 font-bold">2.</span>
                        <span>Backend generates 96-bit CSPRNG nonce and computes AES-256-GCM ciphertext.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-cyan-400 font-bold">3.</span>
                        <span>Encrypted payload is stored in PostgreSQL and linked with blockchain ID.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Grant Access */}
            {activeTab === "grant" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <section className="lg:col-span-8 rounded-2xl border border-vault-border bg-vault-card p-6 sm:p-8 shadow-xl space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 text-base">
                        🤝
                      </span>
                      Grant Member Access On-Chain
                    </h2>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                      Issue a time-bound cryptographic permission to a team member's Web3 wallet address. After the expiry timestamp, access automatically fails closed.
                    </p>
                  </div>

                  <form onSubmit={handleGrantAccess} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-200 mb-1.5 uppercase tracking-wider font-mono">
                          Vault UUID
                        </label>
                        <input
                          className="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-white placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 font-mono transition-all"
                          placeholder="e.g. 123e4567-e89b..."
                          value={grantVaultId}
                          onChange={(e) => {
                            setGrantVaultId(e.target.value);
                            if (e.target.value.trim().length >= 32) loadVaultActivity(e.target.value);
                          }}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-200 mb-1.5 uppercase tracking-wider font-mono">
                          Access Expiration
                        </label>
                        <input
                          type="datetime-local"
                          min={toDateTimeLocalString(new Date())}
                          className="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-white outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 transition-all"
                          value={grantExpiry}
                          onChange={(e) => setGrantExpiry(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                          Grantee Wallet Address
                        </label>
                        {address && (
                          <button
                            type="button"
                            onClick={() => setGrantWallet(address)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-mono"
                          >
                            Use My Own Address (Self-Grant)
                          </button>
                        )}
                      </div>
                      <input
                        className="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-white placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 font-mono transition-all"
                        placeholder="0x..."
                        value={grantWallet}
                        onChange={(e) => setGrantWallet(e.target.value)}
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3.5 text-xs sm:text-sm font-bold text-white hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.99] focus-visible:outline-none"
                    >
                      Authorize &amp; Commit Grant to Chain
                    </button>

                    {grantStatus && (
                      <div
                        className={`rounded-xl p-3.5 text-xs font-mono border leading-relaxed ${
                          grantStatus.includes("Error") || grantStatus.includes("couldn't") || grantStatus.includes("Expiry must")
                            ? "bg-rose-950/30 border-rose-800/40 text-rose-300"
                            : grantStatus.includes("Success")
                            ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                            : "bg-vault-surface border-vault-border text-slate-300"
                        }`}
                      >
                        {grantStatus}
                      </div>
                    )}
                  </form>
                </section>

                <div className="lg:col-span-4 space-y-4">
                  <div className="rounded-2xl border border-vault-border bg-vault-surface p-6 text-xs space-y-3">
                    <h3 className="font-bold text-white text-sm">Rules &amp; Verification</h3>
                    <ul className="space-y-2 text-slate-400 list-disc list-inside">
                      <li>Minimum expiry requirement: at least 2 minutes in the future.</li>
                      <li>Role is set to Viewer (2) by smart contract default.</li>
                      <li>Transaction gas is sponsored on Hardhat or testnet Arbitrum Sepolia.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Revoke Access */}
            {activeTab === "revoke" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <section className="lg:col-span-8 rounded-2xl border border-vault-border bg-vault-card p-6 sm:p-8 shadow-xl space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 text-base">
                        🚫
                      </span>
                      Immediate On-Chain Revocation
                    </h2>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                      Instantly invalidate a member's viewing permission on the smart contract before their scheduled expiry. Subsequent reveal requests will fail closed with 403.
                    </p>
                  </div>

                  <form onSubmit={handleRevokeAccess} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-200 mb-1.5 uppercase tracking-wider font-mono">
                          Vault UUID
                        </label>
                        <input
                          className="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-white placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 font-mono transition-all"
                          placeholder="e.g. 123e4567-e89b..."
                          value={revokeVaultId}
                          onChange={(e) => {
                            setRevokeVaultId(e.target.value);
                            if (e.target.value.trim().length >= 32) loadVaultActivity(e.target.value);
                          }}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-200 mb-1.5 uppercase tracking-wider font-mono">
                          Team Member Wallet Address
                        </label>
                        <input
                          className="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-3 text-sm text-white placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 font-mono transition-all"
                          placeholder="0x..."
                          value={revokeWallet}
                          onChange={(e) => setRevokeWallet(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full rounded-xl bg-gradient-to-r from-rose-600 to-red-700 px-6 py-3.5 text-xs sm:text-sm font-bold text-white hover:from-rose-500 hover:to-red-600 transition-all shadow-lg shadow-rose-900/20 active:scale-[0.99] focus-visible:outline-none"
                    >
                      Revoke Permission On-Chain
                    </button>

                    {revokeStatus && (
                      <div
                        className={`rounded-xl p-3.5 text-xs font-mono border leading-relaxed ${
                          revokeStatus.includes("Error") || revokeStatus.includes("couldn't")
                            ? "bg-rose-950/30 border-rose-800/40 text-rose-300"
                            : revokeStatus.includes("Success")
                            ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                            : "bg-vault-surface border-vault-border text-slate-300"
                        }`}
                      >
                        {revokeStatus}
                      </div>
                    )}
                  </form>
                </section>
              </div>
            )}

            {/* Tab 4: Audit Trail & Permissions */}
            {activeTab === "audit" && (
              <div className="space-y-6">
                {/* Vault UUID selector banner */}
                <div className="rounded-2xl border border-vault-border bg-vault-card p-5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider font-mono mb-1.5">
                      Query Activity For Vault UUID
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="w-full rounded-xl border border-vault-border bg-vault-surface px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                        placeholder="Paste Vault UUID to inspect live logs..."
                        value={activeVaultId}
                        onChange={(e) => {
                          setActiveVaultId(e.target.value);
                          if (e.target.value.trim().length >= 32) loadVaultActivity(e.target.value);
                        }}
                      />
                      <button
                        onClick={() => loadVaultActivity(activeVaultId)}
                        className="rounded-xl border border-vault-border bg-vault-surface px-4 py-2.5 text-xs font-bold text-slate-300 hover:border-cyan-500 hover:text-cyan-400 whitespace-nowrap"
                      >
                        Refresh Logs
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Current Active Permissions Column */}
                  <div className="lg:col-span-5 rounded-2xl border border-vault-border bg-vault-card p-6 shadow-md flex flex-col">
                    <div className="mb-4">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 text-sm">
                          👥
                        </span>
                        Active Permissions
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        {activeVaultId
                          ? `Granted wallets for ${activeVaultId.slice(0, 8)}...`
                          : "Enter a Vault UUID to view permissions projection"}
                      </p>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 max-h-96 pr-1 text-xs">
                      {!activeVaultId ? (
                        <div className="text-slate-500 text-center italic p-8 border border-dashed border-vault-border rounded-xl">
                          No vault selected. Enter a Vault UUID above.
                        </div>
                      ) : permissions.length === 0 ? (
                        <div className="text-slate-500 text-center italic p-8 border border-dashed border-vault-border rounded-xl">
                          No active permissions found for this vault.
                        </div>
                      ) : (
                        permissions.map((p, idx) => (
                          <div
                            key={idx}
                            className="rounded-xl border border-vault-border p-3.5 bg-vault-surface text-slate-300 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-cyan-300 font-semibold">
                                {p.walletAddress ? `${p.walletAddress.slice(0, 8)}...${p.walletAddress.slice(-6)}` : "Unknown"}
                              </span>
                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                  p.active
                                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                    : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                }`}
                              >
                                {p.active ? "ACTIVE" : "REVOKED"}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              Expires: {new Date(p.expiresAt).toLocaleString()}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Audit Logs Column */}
                  <div className="lg:col-span-7 rounded-2xl border border-vault-border bg-vault-card p-6 shadow-md flex flex-col">
                    <div className="mb-4">
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 text-sm">
                          📜
                        </span>
                        Immutable Audit Trail
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        {activeVaultId
                          ? `Security events recorded in PostgreSQL for ${activeVaultId.slice(0, 8)}...`
                          : "Recent lifecycle events recorded in backend database"}
                      </p>
                    </div>

                    <div className="flex-1 max-h-96 overflow-y-auto space-y-3 pr-1 text-xs">
                      {auditLogsStatus && auditLogs.length === 0 ? (
                        <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 p-4 text-center text-rose-300">
                          {auditLogsStatus}
                        </div>
                      ) : !activeVaultId ? (
                        <div className="flex flex-col items-center justify-center h-48 text-center p-6 border border-dashed border-vault-border rounded-xl">
                          <span className="text-2xl mb-2">📋</span>
                          <p className="text-slate-400 font-medium text-xs">Enter a Vault UUID above to load audit history</p>
                        </div>
                      ) : auditLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-center p-6 border border-dashed border-vault-border rounded-xl">
                          <span className="text-2xl mb-2">📋</span>
                          <p className="text-slate-400 font-medium text-xs">No activity yet recorded</p>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                            Security events (vault creation, grants, reveals, revokes) will be cataloged here automatically.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-vault-border text-[11px] text-slate-400 uppercase tracking-wider font-mono">
                                <th className="py-2.5 px-2 font-semibold">Timestamp</th>
                                <th className="py-2.5 px-2 font-semibold">Action</th>
                                <th className="py-2.5 px-2 font-semibold">Wallet</th>
                                <th className="py-2.5 px-2 font-semibold">Details</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-vault-border/50">
                              {auditLogs.map((log) => {
                                const metaStr = formatMetadata(log.metadata);
                                const actionLabel = mapAuditAction(log.action);
                                return (
                                  <tr key={log.id} className="hover:bg-vault-surface/60 transition-colors">
                                    <td className="py-2 px-2 text-slate-400 text-[11px] whitespace-nowrap font-mono">
                                      {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                    </td>
                                    <td className="py-2 px-2 whitespace-nowrap">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                          log.action === "VAULT_CREATED"
                                            ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                            : log.action === "ACCESS_GRANTED"
                                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                            : log.action === "SECRET_RETRIEVED"
                                            ? "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                                            : log.action === "ACCESS_REVOKED"
                                            ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                                            : "bg-slate-800 text-slate-300"
                                        }`}
                                      >
                                        {actionLabel}
                                      </span>
                                    </td>
                                    <td className="py-2 px-2 font-mono text-slate-200 text-[11px] whitespace-nowrap">
                                      {log.walletAddress
                                        ? `${log.walletAddress.slice(0, 6)}...${log.walletAddress.slice(-4)}`
                                        : "—"}
                                    </td>
                                    <td className="py-2 px-2 text-[11px] text-slate-400">
                                      {metaStr || "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
