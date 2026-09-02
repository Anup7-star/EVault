"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import ConnectWallet from "@/components/ConnectWallet";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";

type AuditLog = { timestamp: string; actor: string; action: string; detail: string };

export default function AdminDashboard() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [vaultName, setVaultName] = useState("");
  const [vaultSecret, setVaultSecret] = useState("");
  const [registerStatus, setRegisterStatus] = useState<string>("");
  const [lastVaultId, setLastVaultId] = useState<string>("");

  const [grantVaultId, setGrantVaultId] = useState("");
  const [grantWallet, setGrantWallet] = useState("");
  const [grantExpiry, setGrantExpiry] = useState("");
  const [grantStatus, setGrantStatus] = useState<string>("");

  const [revokeVaultId, setRevokeVaultId] = useState("");
  const [revokeWallet, setRevokeWallet] = useState("");
  const [revokeStatus, setRevokeStatus] = useState<string>("");

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const contractReady = CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

  async function refreshLogs() {
    try {
      const res = await fetch("/api/audit");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      // Keep existing log state if refresh fails quietly
    }
  }

  useEffect(() => {
    refreshLogs();
  }, []);

  async function handleRegisterVault(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient) return;
    setRegisterStatus("Submitting vault registration to the blockchain...");
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "registerVault",
        args: [vaultName],
      });
      setRegisterStatus("Transaction sent! Waiting for blockchain confirmation...");
      await publicClient.waitForTransactionReceipt({ hash });

      const count = (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "getVaultCount",
      })) as bigint;
      const vaultId = (count - 1n).toString();
      setLastVaultId(vaultId);

      await fetch("/api/vault/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, secret: vaultSecret, actor: address }),
      });

      setRegisterStatus(`Success! Vault #${vaultId} was registered and your secret is safely encrypted.`);
      setVaultName("");
      setVaultSecret("");
      refreshLogs();
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "An unexpected issue occurred.";
      setRegisterStatus(`Registration couldn't be completed: ${errorMsg}`);
    }
  }

  async function handleGrantAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient) return;
    setGrantStatus("Submitting access permission to the blockchain...");
    try {
      const expiryTimestamp = BigInt(Math.floor(new Date(grantExpiry).getTime() / 1000));
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "grantAccess",
        args: [BigInt(grantVaultId), grantWallet as `0x${string}`, expiryTimestamp],
      });
      setGrantStatus("Transaction sent! Confirming permission on-chain...");
      await publicClient.waitForTransactionReceipt({ hash });

      const formattedDate = new Date(grantExpiry).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      setGrantStatus(`Success! Granted access for Vault #${grantVaultId} to ${grantWallet.slice(0, 6)}...${grantWallet.slice(-4)} until ${formattedDate}.`);
      refreshLogs();
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "An unexpected issue occurred.";
      setGrantStatus(`Permission grant couldn't be completed: ${errorMsg}`);
    }
  }

  async function handleRevokeAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient) return;
    setRevokeStatus("Submitting access revocation to the blockchain...");
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "revokeAccess",
        args: [BigInt(revokeVaultId), revokeWallet as `0x${string}`],
      });
      setRevokeStatus("Transaction sent! Confirming revocation on-chain...");
      await publicClient.waitForTransactionReceipt({ hash });

      setRevokeStatus(`Success! Access to Vault #${revokeVaultId} for ${revokeWallet.slice(0, 6)}...${revokeWallet.slice(-4)} has been revoked.`);
      refreshLogs();
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "An unexpected issue occurred.";
      setRevokeStatus(`Revocation couldn't be completed: ${errorMsg}`);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
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
            Admin Console
          </h1>
          <p className="text-xs text-warm-muted mt-0.5">
            Create encrypted vaults and manage time-bound access for your team.
          </p>
        </div>
        <ConnectWallet />
      </header>

      {/* Disconnected State */}
      {!isConnected && (
        <div className="rounded-2xl border border-warm-border bg-warm-surface p-8 text-center shadow-md max-w-xl mx-auto my-8">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-warm-text">Wallet Connection Required</h2>
          <p className="mt-1 text-sm text-warm-muted">
            Please connect your admin wallet to create vaults and authorize member access.
          </p>
        </div>
      )}

      {/* Contract Not Detected Notice */}
      {isConnected && !contractReady && (
        <div className="mb-8 rounded-2xl border border-amber-800/40 bg-amber-950/20 p-5 text-sm text-amber-200/90">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-bold text-amber-200">Smart Contract Connection Required</p>
              <p className="mt-1 text-xs text-amber-300/80 leading-relaxed">
                The vault registry smart contract hasn't been detected on your network. Please ensure your local Hardhat node is running and deploy the contract using <code className="rounded bg-amber-900/40 px-1.5 py-0.5 text-amber-200 font-mono">npm run deploy:local</code>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Form Dashboard */}
      {isConnected && contractReady && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Action Cards Column */}
          <div className="space-y-8 lg:col-span-7">
            {/* Form 1: Create Vault */}
            <section className="rounded-2xl border border-warm-border bg-warm-surface p-6 shadow-md">
              <div className="mb-5">
                <h2 className="text-lg font-bold text-warm-text flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 text-sm">
                    🔒
                  </span>
                  Create New Vault
                </h2>
                <p className="mt-1 text-xs text-warm-muted leading-relaxed">
                  Store a new secret securely. The metadata is recorded on-chain, and your secret content is encrypted before storage.
                </p>
              </div>

              <form onSubmit={handleRegisterVault} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-warm-text mb-1.5">
                    Vault Name or Purpose
                  </label>
                  <input
                    className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                    placeholder="e.g. Production Database Credentials"
                    value={vaultName}
                    onChange={(e) => setVaultName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-warm-text mb-1.5">
                    Secret Content to Encrypt
                  </label>
                  <textarea
                    className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 font-mono"
                    placeholder="Paste confidential keys, passwords, or secret notes here..."
                    value={vaultSecret}
                    onChange={(e) => setVaultSecret(e.target.value)}
                    rows={3}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-warm-accent px-4 py-3 text-xs font-bold text-stone-950 hover:bg-amber-500 active:scale-[0.99] transition-all shadow-md shadow-amber-950/20 focus-visible:outline-none"
                >
                  Create &amp; Protect Vault
                </button>

                {registerStatus && (
                  <div
                    className={`rounded-xl p-3 text-xs leading-relaxed border font-mono ${
                      registerStatus.includes("Error") || registerStatus.includes("couldn't")
                        ? "bg-rose-950/30 border-rose-800/40 text-rose-300"
                        : registerStatus.includes("Success")
                        ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                        : "bg-warm-card border-warm-border text-warm-muted"
                    }`}
                  >
                    {registerStatus}
                  </div>
                )}

                {lastVaultId && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                    💡 **Vault Created!** Your newly generated Vault ID is <span className="font-mono font-bold underline text-white">#{lastVaultId}</span>. Use this ID to grant member access below.
                  </div>
                )}
              </form>
            </section>

            {/* Form 2: Grant Access */}
            <section className="rounded-2xl border border-warm-border bg-warm-surface p-6 shadow-md">
              <div className="mb-5">
                <h2 className="text-lg font-bold text-warm-text flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 text-sm">
                    🤝
                  </span>
                  Grant Member Access
                </h2>
                <p className="mt-1 text-xs text-warm-muted leading-relaxed">
                  Give a team member temporary, blockchain-verified access to view a specific vault's secret.
                </p>
              </div>

              <form onSubmit={handleGrantAccess} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-warm-text mb-1.5">
                      Vault ID
                    </label>
                    <input
                      className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 font-mono"
                      placeholder="e.g. 0"
                      value={grantVaultId}
                      onChange={(e) => setGrantVaultId(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-warm-text mb-1.5">
                      Access Expiration Date &amp; Time
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                      value={grantExpiry}
                      onChange={(e) => setGrantExpiry(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-warm-text mb-1.5">
                    Team Member Wallet Address
                  </label>
                  <input
                    className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 font-mono"
                    placeholder="0x..."
                    value={grantWallet}
                    onChange={(e) => setGrantWallet(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-warm-accent px-4 py-3 text-xs font-bold text-stone-950 hover:bg-amber-500 active:scale-[0.99] transition-all shadow-md shadow-amber-950/20 focus-visible:outline-none"
                >
                  Confirm &amp; Grant Access
                </button>

                {grantStatus && (
                  <div
                    className={`rounded-xl p-3 text-xs leading-relaxed border font-mono ${
                      grantStatus.includes("Error") || grantStatus.includes("couldn't")
                        ? "bg-rose-950/30 border-rose-800/40 text-rose-300"
                        : grantStatus.includes("Success")
                        ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                        : "bg-warm-card border-warm-border text-warm-muted"
                    }`}
                  >
                    {grantStatus}
                  </div>
                )}
              </form>
            </section>

            {/* Form 3: Revoke Access */}
            <section className="rounded-2xl border border-warm-border bg-warm-surface p-6 shadow-md">
              <div className="mb-5">
                <h2 className="text-lg font-bold text-warm-text flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 text-sm">
                    🚫
                  </span>
                  Revoke Member Access
                </h2>
                <p className="mt-1 text-xs text-warm-muted leading-relaxed">
                  Immediately cancel a member's on-chain permission to view a specific vault before its expiry time.
                </p>
              </div>

              <form onSubmit={handleRevokeAccess} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-warm-text mb-1.5">
                      Vault ID
                    </label>
                    <input
                      className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 font-mono"
                      placeholder="e.g. 0"
                      value={revokeVaultId}
                      onChange={(e) => setRevokeVaultId(e.target.value)}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-warm-text mb-1.5">
                      Team Member Wallet Address
                    </label>
                    <input
                      className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 font-mono"
                      placeholder="0x..."
                      value={revokeWallet}
                      onChange={(e) => setRevokeWallet(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-rose-700 hover:bg-rose-600 px-4 py-3 text-xs font-bold text-white active:scale-[0.99] transition-all shadow-md shadow-rose-950/20 focus-visible:outline-none"
                >
                  Revoke Access On-Chain
                </button>

                {revokeStatus && (
                  <div
                    className={`rounded-xl p-3 text-xs leading-relaxed border font-mono ${
                      revokeStatus.includes("Error") || revokeStatus.includes("couldn't")
                        ? "bg-rose-950/30 border-rose-800/40 text-rose-300"
                        : revokeStatus.includes("Success")
                        ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                        : "bg-warm-card border-warm-border text-warm-muted"
                    }`}
                  >
                    {revokeStatus}
                  </div>
                )}
              </form>
            </section>
          </div>

          {/* Audit Log Column */}
          <div className="lg:col-span-5">
            <section className="h-full rounded-2xl border border-warm-border bg-warm-surface p-6 shadow-md flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-warm-text flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 text-sm">
                      📜
                    </span>
                    Activity Log
                  </h2>
                  <p className="text-[11px] text-warm-muted">On-chain and system event history</p>
                </div>
                <button
                  onClick={refreshLogs}
                  className="rounded-xl border border-warm-border bg-warm-card px-3 py-1.5 text-xs font-medium text-warm-muted hover:border-warm-border-hover hover:text-warm-text transition-colors focus-visible:outline-none"
                >
                  Refresh
                </button>
              </div>

              <div className="flex-1 max-h-[720px] overflow-y-auto space-y-3 pr-1 text-xs">
                {logs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-48 text-center p-6 border border-dashed border-warm-border rounded-xl">
                    <span className="text-2xl mb-2">📋</span>
                    <p className="text-warm-muted font-medium text-xs">No activity recorded yet</p>
                    <p className="text-[11px] text-warm-muted/70 mt-1 max-w-xs">
                      Actions like creating vaults or granting member access will be logged here automatically.
                    </p>
                  </div>
                )}

                {logs.map((log, i) => {
                  const isDenied = log.action.includes("DENIED") || log.action.includes("REVOKED");
                  const isGranted = log.action.includes("GRANTED");
                  const isCreated = log.action.includes("REGISTERED") || log.action.includes("CREATED");

                  return (
                    <div
                      key={i}
                      className="rounded-xl border border-warm-border bg-warm-card p-4 space-y-2 font-sans transition-all hover:border-warm-border-hover"
                    >
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-warm-muted font-mono">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                            isDenied
                              ? "bg-rose-950/40 text-rose-300 border border-rose-800/40"
                              : isGranted
                              ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40"
                              : isCreated
                              ? "bg-amber-950/40 text-amber-300 border border-amber-800/40"
                              : "bg-stone-800 text-warm-muted border border-stone-700"
                          }`}
                        >
                          {log.action.replace("_", " ")}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-warm-muted font-medium">Actor:</span>
                        <span className="text-warm-text font-mono font-medium">
                          {log.actor ? `${log.actor.slice(0, 6)}...${log.actor.slice(-4)}` : "System"}
                        </span>
                      </div>

                      <p className="text-xs text-warm-text/90 leading-relaxed font-sans">
                        {log.detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
