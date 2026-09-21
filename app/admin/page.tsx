"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, usePublicClient, useChainId, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";
import ConnectWallet from "@/components/ConnectWallet";
import { useSession } from "@/components/SessionContext";
import { apiClient } from "@/lib/apiClient";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "@/lib/contract";

// Deferred: Standalone error pages, responsive polish, dedicated transaction-status screen.
// Audit log data source is stubbed for now but UI is preserved.

export default function AdminDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { token, setSession, clearSession } = useSession();

  const [authStatus, setAuthStatus] = useState("");

  const [vaultName, setVaultName] = useState("");
  const [vaultDescription, setVaultDescription] = useState("");
  const [vaultStorageRef, setVaultStorageRef] = useState("s3://default-bucket/ref");
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

  const [permissions, setPermissions] = useState<any[]>([]);

  const contractReady = CONTRACT_ADDRESS && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

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

  async function handleSignIn() {
    if (!address) return;
    setAuthStatus("Fetching secure nonce...");
    try {
      const { nonce } = await apiClient.getNonce(address);

      setAuthStatus("Please sign the message in your wallet...");
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to EVault Admin",
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
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // In a real app we'd parse the event logs from receipt.
      // For this prototype, we'll fetch the count.
      const count = (await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "getVaultCount",
      })) as bigint;
      const blockchainVaultId = (count - 1n).toString();
      
      setRegisterStatus(`Blockchain confirmed Vault #${blockchainVaultId}. Syncing with backend...`);

      const res = await apiClient.createVault(token, {
        blockchainVaultId: Number(blockchainVaultId),
        name: vaultName,
        description: vaultDescription,
        storageReference: vaultStorageRef,
        secret: vaultSecret
      });

      setLastVaultId(res.id); // UUID from backend
      setRegisterStatus(`Success! Vault created on-chain (#${blockchainVaultId}) and secured in backend (UUID: ${res.id}).`);
      setVaultName("");
      setVaultDescription("");
      setVaultSecret("");
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "An unexpected issue occurred.";
      setRegisterStatus(`Registration couldn't be completed: ${errorMsg}`);
    }
  }

  async function handleGrantAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !token) return;
    setGrantStatus("Submitting access permission to the blockchain...");
    try {
      const expiryTimestamp = BigInt(Math.floor(new Date(grantExpiry).getTime() / 1000));
      
      // Need the blockchain vault ID. We assume the user entered the UUID in grantVaultId.
      // Fetch vault details to get the blockchain ID.
      const vault = await apiClient.getVault(token, grantVaultId);
      
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "grantAccess",
        args: [BigInt(vault.blockchainVaultId), grantWallet as `0x${string}`, 2, expiryTimestamp],
      });
      setGrantStatus("Transaction sent! Confirming permission on-chain...");
      await publicClient.waitForTransactionReceipt({ hash });

      setGrantStatus("On-chain grant confirmed! Syncing with backend...");
      await apiClient.grantPermission(token, grantVaultId, {
         walletAddress: grantWallet,
         role: 2, // Hardcoded role 2 (viewer) for prototype
         expiresAt: new Date(grantExpiry).toISOString()
      });

      setGrantStatus(`Success! Granted access for Vault to ${grantWallet.slice(0, 6)}...${grantWallet.slice(-4)}.`);
      
      // Refresh permissions
      const perms = await apiClient.listPermissions(token, grantVaultId);
      setPermissions(perms);
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "An unexpected issue occurred.";
      setGrantStatus(`Permission grant couldn't be completed: ${errorMsg}`);
    }
  }

  async function handleRevokeAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!publicClient || !token) return;
    setRevokeStatus("Submitting access revocation to the blockchain...");
    try {
      const vault = await apiClient.getVault(token, revokeVaultId);

      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "revokeAccess",
        args: [BigInt(vault.blockchainVaultId), revokeWallet as `0x${string}`],
      });
      setRevokeStatus("Transaction sent! Confirming revocation on-chain...");
      await publicClient.waitForTransactionReceipt({ hash });

      setRevokeStatus("On-chain revoke confirmed! Syncing with backend...");
      await apiClient.revokePermission(token, revokeVaultId, revokeWallet);

      setRevokeStatus(`Success! Access revoked.`);
      
      // Refresh permissions
      const perms = await apiClient.listPermissions(token, revokeVaultId);
      setPermissions(perms);
    } catch (err: any) {
      const errorMsg = err.shortMessage || err.message || "An unexpected issue occurred.";
      setRevokeStatus(`Revocation couldn't be completed: ${errorMsg}`);
    }
  }
  
  async function loadPermissions(vaultId: string) {
    if (!token) return;
    try {
        const perms = await apiClient.listPermissions(token, vaultId);
        setPermissions(perms);
    } catch (e) {
        setPermissions([]);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
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

      {isConnected && !token && authStatus && (
        <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 p-5 text-sm text-amber-200/90 text-center mb-8">
          <p className="animate-pulse">{authStatus}</p>
          {authStatus.includes("failed") && (
            <button onClick={handleSignIn} className="mt-4 rounded-xl border border-amber-500/50 px-4 py-2 hover:bg-amber-500/20">
              Retry Sign-In
            </button>
          )}
        </div>
      )}

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

      {isConnected && token && contractReady && (
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
                    Vault Name
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
                    Description (Optional)
                  </label>
                  <input
                    className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
                    placeholder="Short description"
                    value={vaultDescription}
                    onChange={(e) => setVaultDescription(e.target.value)}
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
                      registerStatus.includes("Error") || registerStatus.includes("couldn't") || registerStatus.includes("failed")
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
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200 break-all">
                    💡 **Vault Created!** Your newly generated Vault UUID is <span className="font-mono font-bold underline text-white">{lastVaultId}</span>. Use this ID to grant member access below.
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
                      Vault UUID
                    </label>
                    <input
                      className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 font-mono"
                      placeholder="e.g. 123e4567..."
                      value={grantVaultId}
                      onChange={(e) => {
                          setGrantVaultId(e.target.value);
                          if(e.target.value.length > 30) loadPermissions(e.target.value);
                      }}
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
                      Vault UUID
                    </label>
                    <input
                      className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 font-mono"
                      placeholder="e.g. 123e4567..."
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

          {/* Audit Log / Permissions Column */}
          <div className="lg:col-span-5">
             <section className="h-full rounded-2xl border border-warm-border bg-warm-surface p-6 shadow-md flex flex-col mb-8">
              <div className="mb-4">
                <h2 className="text-lg font-bold text-warm-text flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 text-sm">
                    👥
                  </span>
                  Current Permissions
                </h2>
                <p className="text-[11px] text-warm-muted">View permissions for selected Vault ID.</p>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                 {permissions.length === 0 ? (
                    <div className="text-warm-muted text-center italic p-4">No permissions found or no valid vault ID selected.</div>
                 ) : (
                    permissions.map((p, idx) => (
                       <div key={idx} className="rounded-xl border border-warm-border p-3 text-warm-text bg-warm-card">
                          <p><strong>Wallet:</strong> <span className="font-mono">{p.walletAddress?.slice(0, 10) ?? "Unknown"}...</span></p>
                          <p><strong>Status:</strong> {p.active ? "ACTIVE" : "REVOKED"}</p>
                          <p><strong>Expires:</strong> {new Date(p.expiresAt).toLocaleString()}</p>
                       </div>
                    ))
                 )}
              </div>
             </section>

            <section className="h-full rounded-2xl border border-warm-border bg-warm-surface p-6 shadow-md flex flex-col opacity-50">
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
              </div>

              <div className="flex-1 max-h-[720px] overflow-y-auto space-y-3 pr-1 text-xs">
                  <div className="flex flex-col items-center justify-center h-48 text-center p-6 border border-dashed border-warm-border rounded-xl">
                    <span className="text-2xl mb-2">📋</span>
                    <p className="text-warm-muted font-medium text-xs">Activity logs temporarily unavailable</p>
                    <p className="text-[11px] text-warm-muted/70 mt-1 max-w-xs">
                      // TODO: Wire up a GET /audit-logs endpoint to the backend audit_logs table.
                    </p>
                  </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
