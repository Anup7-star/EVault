"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useSignMessage } from "wagmi";
import ConnectWallet from "@/components/ConnectWallet";
import { buildSiweMessage } from "@/lib/siwe";

export default function UserDashboard() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [vaultId, setVaultId] = useState("");
  const [status, setStatus] = useState("");
  const [secret, setSecret] = useState<string | null>(null);

  async function handleRequestAccess(e: React.FormEvent) {
    e.preventDefault();
    if (!address) return;
    setSecret(null);
    setStatus("Generating secure sign-in request...");
    try {
      const nonceRes = await fetch(`/api/siwe/nonce?address=${address}`);
      const { nonce } = await nonceRes.json();

      const message = buildSiweMessage({
        domain: typeof window !== "undefined" ? window.location.host : "localhost",
        address,
        nonce,
        statement: `Request access to Vault #${vaultId}. No password needed — this signature proves wallet ownership without gas fees.`,
      });

      setStatus("Please approve the signature request in your wallet. (No gas fees required)");
      const signature = await signMessageAsync({ message });

      setStatus("Signature approved! Verifying your access permissions on the blockchain...");
      const res = await fetch("/api/vault/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, address, message, signature }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Access denied. Your permission for this vault may have expired or hasn't been granted yet.");
        return;
      }

      setSecret(data.secret);
      setStatus("✓ Access confirmed! Your decrypted secret is ready below.");
    } catch (err: any) {
      if (err.message?.includes("User rejected") || err.shortMessage?.includes("User rejected")) {
        setStatus("Signature request was declined in your wallet. Feel free to try again whenever you're ready.");
      } else {
        setStatus(`Could not unlock vault: ${err.shortMessage || err.message || "Please check your wallet connection."}`);
      }
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

      {isConnected && (
        <div className="space-y-6">
          {/* Reassurance Banner */}
          <div className="rounded-2xl border border-warm-border bg-warm-surface p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="text-xl">💡</span>
              <div className="text-xs text-warm-muted leading-relaxed">
                <p className="font-bold text-warm-text mb-1">How wallet authentication works</p>
                When you request a secret, your Web3 wallet will prompt you to <strong className="text-amber-300">sign a message</strong>. This is 100% free (no gas fees or token transfers) — it simply proves you own this wallet address so we can safely decrypt the vault for you.
              </div>
            </div>
          </div>

          {/* Request Form Section */}
          <section className="rounded-2xl border border-warm-border bg-warm-surface p-6 shadow-md">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-warm-text flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 text-sm">
                  🔑
                </span>
                Unlock Vault Content
              </h2>
              <p className="mt-1 text-xs text-warm-muted leading-relaxed">
                Enter the Vault ID assigned to you by your admin to verify permissions and view the secret.
              </p>
            </div>

            <form onSubmit={handleRequestAccess} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-warm-text mb-1.5">
                  Target Vault ID
                </label>
                <input
                  className="w-full rounded-xl border border-warm-border bg-warm-card px-4 py-2.5 text-sm text-warm-text placeholder-warm-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 font-mono"
                  placeholder="Enter vault ID (e.g. 0)"
                  value={vaultId}
                  onChange={(e) => setVaultId(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-warm-accent px-4 py-3 text-xs font-bold text-stone-950 hover:bg-amber-500 active:scale-[0.99] transition-all shadow-md shadow-amber-950/20 focus-visible:outline-none"
              >
                Verify Wallet &amp; Unlock Secret
              </button>
            </form>

            {/* Friendly Status Feedback */}
            {status && (
              <div
                className={`mt-5 rounded-xl p-3.5 text-xs leading-relaxed border font-mono ${
                  status.includes("Could not") || status.includes("denied") || status.includes("declined")
                    ? "bg-rose-950/30 border-rose-800/40 text-rose-300"
                    : status.includes("✓") || status.includes("ready")
                    ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
                    : "bg-warm-card border-warm-border text-amber-200/90"
                }`}
              >
                {status}
              </div>
            )}

            {/* Decrypted Secret Result Box */}
            {secret && (
              <div className="mt-6 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 p-5 shadow-inner">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <span>🔓</span> Decrypted Secret Content
                  </p>
                  <span className="text-[10px] text-emerald-400/80 font-mono">Verified On-Chain</span>
                </div>
                <div className="rounded-xl bg-warm-bg border border-warm-border p-4 font-mono text-sm text-warm-text select-all break-all shadow-sm">
                  {secret}
                </div>
                <p className="mt-2 text-[11px] text-warm-muted font-sans text-right">
                  Decrypted securely in your browser.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
