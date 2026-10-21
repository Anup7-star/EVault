"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";
import { CONTRACT_ADDRESS } from "@/lib/contract";
import { useAccount } from "wagmi";
import { useSession } from "@/components/SessionContext";

export default function Home() {
  const { isConnected, address } = useAccount();
  const { token, status, authStatus, authError, signIn, signOut } = useSession();

  return (
    <div className="min-h-screen flex flex-col bg-vault-bg text-vault-text selection:bg-cyan-500/30 selection:text-cyan-200">
      <Navbar />

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16 space-y-16">
        {/* Hero Section */}
        <section className="text-center space-y-6 max-w-3xl mx-auto pt-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 text-xs font-semibold text-cyan-300 shadow-sm shadow-cyan-500/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span>Live on Arbitrum Sepolia &amp; Local Testnet</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl font-sans leading-tight">
            Decentralized Web-Vault &amp;{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">
              Enterprise Access
            </span>
          </h1>

          <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Eliminate centralized credential leaks. Store confidential secrets with hardware-grade
            AES-256-GCM encryption, managed by immutable on-chain smart contract permissions and EIP-4361 SIWE authentication.
          </p>

          {/* Interactive Sign-In & Authentication Hero State */}
          {isConnected && !token && (
            <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-b from-cyan-950/40 via-vault-card/80 to-vault-surface/90 backdrop-blur-md p-6 text-center max-w-xl mx-auto shadow-xl shadow-cyan-950/40 space-y-4">
              <div className="flex items-center justify-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
                </span>
                <span className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
                  Wallet Connected • Sign-In Required
                </span>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Connected:{" "}
                <span className="font-mono text-cyan-300 bg-black/50 px-2 py-0.5 rounded border border-cyan-500/30">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
                </span>
                . Authenticate via EIP-4361 Sign-In with Ethereum to access encrypted credentials and manage vaults.
              </p>

              {authStatus && (
                <p className="text-xs font-mono text-cyan-300 animate-pulse">{authStatus}</p>
              )}

              {authError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-300 font-mono text-left">
                  {authError}
                </div>
              )}

              <div className="pt-1 flex items-center justify-center gap-3">
                <button
                  onClick={signIn}
                  disabled={status === "signing-in"}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-500 px-6 py-3 text-xs sm:text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-emerald-400 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                >
                  {status === "signing-in" ? (
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
            </div>
          )}

          {isConnected && token && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md p-4 max-w-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span>
                  Authenticated:{" "}
                  <span className="font-mono font-bold text-white">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>{" "}
                  (SIWE Session Active)
                </span>
              </div>
              <button
                onClick={signOut}
                className="text-slate-400 hover:text-rose-300 transition-colors font-mono underline"
              >
                Sign Out
              </button>
            </div>
          )}

          {/* Quick status callout */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>🛡️ Open Admin Console</span>
              <span>→</span>
            </Link>
            <Link
              href="/user"
              className="inline-flex items-center gap-2 rounded-xl border border-vault-border bg-vault-card px-6 py-3 text-xs sm:text-sm font-bold text-slate-200 hover:border-amber-500/40 hover:text-amber-300 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>🔑 Access Shared Vaults</span>
              <span>→</span>
            </Link>
          </div>
        </section>

        {/* Portals Grid */}
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 text-left">
          {/* Admin Portal Card */}
          <Link
            href="/admin"
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-vault-border bg-vault-card/70 p-7 transition-all duration-300 hover:border-cyan-500/50 hover:bg-vault-card hover:shadow-2xl hover:shadow-cyan-500/10 focus-visible:outline-none"
          >
            <div className="absolute top-0 right-0 h-32 w-32 bg-cyan-500/5 rounded-full blur-2xl group-hover:bg-cyan-500/10 transition-all" />

            <div>
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 group-hover:scale-105 group-hover:border-cyan-400/60 transition-all">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-950/50 border border-cyan-800/40">
                  Owner Portal
                </span>
              </div>

              <h2 className="text-2xl font-bold text-white transition-colors group-hover:text-cyan-300 font-sans">
                Admin Console
              </h2>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-400">
                Deploy encrypted vaults to the smart contract registry, grant time-bound viewing access to team member wallets, revoke access instantly, and inspect live immutable audit logs.
              </p>

              <ul className="mt-4 space-y-1.5 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> On-chain vault registry transactions
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> Time-bound permission grants with auto-expiry
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> Real-time owner activity &amp; audit history
                </li>
              </ul>
            </div>

            <div className="mt-7 flex items-center gap-1.5 text-xs font-bold text-cyan-400 group-hover:text-cyan-300">
              <span>Open Admin Dashboard</span>
              <span className="transition-transform group-hover:translate-x-1.5">→</span>
            </div>
          </Link>

          {/* User Portal Card */}
          <Link
            href="/user"
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-vault-border bg-vault-card/70 p-7 transition-all duration-300 hover:border-amber-500/50 hover:bg-vault-card hover:shadow-2xl hover:shadow-amber-500/10 focus-visible:outline-none"
          >
            <div className="absolute top-0 right-0 h-32 w-32 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />

            <div>
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 group-hover:scale-105 group-hover:border-amber-400/60 transition-all">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold px-2 py-0.5 rounded bg-amber-950/50 border border-amber-800/40">
                  Grantee Portal
                </span>
              </div>

              <h2 className="text-2xl font-bold text-white transition-colors group-hover:text-amber-300 font-sans">
                Member Access Portal
              </h2>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-400">
                Authenticate cryptographically with your Web3 wallet signature to view confidential credentials, API keys, and enterprise secrets shared with your address.
              </p>

              <ul className="mt-4 space-y-1.5 text-xs text-slate-300">
                <li className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> EIP-4361 passwordless wallet signature
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> Live on-chain permission verification
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> Zero-trust fail-closed decryption gate
                </li>
              </ul>
            </div>

            <div className="mt-7 flex items-center gap-1.5 text-xs font-bold text-amber-400 group-hover:text-amber-300">
              <span>View Accessible Vaults</span>
              <span className="transition-transform group-hover:translate-x-1.5">→</span>
            </div>
          </Link>
        </section>

        {/* Core Architectural Pillars */}
        <section className="space-y-6 pt-4">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-white font-sans">
              Built on Zero-Trust Cryptographic Guarantees
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto">
              How EVault guarantees confidentiality without relying on centralized master passwords.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="rounded-2xl border border-vault-border bg-vault-surface p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 text-lg mb-3">
                ⛓️
              </div>
              <h4 className="font-bold text-white text-sm mb-1.5">Smart Contract Enforcement</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                All permission grants and expirations are recorded as on-chain transactions in Solidity. Database tampering cannot grant access to an unauthorized wallet.
              </p>
            </div>

            <div className="rounded-2xl border border-vault-border bg-vault-surface p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 text-lg mb-3">
                🔒
              </div>
              <h4 className="font-bold text-white text-sm mb-1.5">AES-256-GCM Encryption</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Secrets are encrypted with unique random 96-bit nonces before touching disk. The Rust backend decrypts only after verifying live blockchain authorization.
              </p>
            </div>

            <div className="rounded-2xl border border-vault-border bg-vault-surface p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 text-lg mb-3">
                📜
              </div>
              <h4 className="font-bold text-white text-sm mb-1.5">Tamper-Proof Audit Trail</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every vault lifecycle event—from initial creation and member grants to secret reveals and revocations—is cataloged with actor wallet timestamps.
              </p>
            </div>
          </div>
        </section>

        {/* Live Contract Info Banner */}
        <section className="rounded-2xl border border-vault-border bg-gradient-to-r from-vault-surface via-vault-card to-vault-surface p-6 sm:p-7 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                Sepolia Smart Contract Deployed
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Contract Address:{" "}
              <span className="font-mono text-cyan-300 break-all">{CONTRACT_ADDRESS}</span>
            </p>
          </div>

          <a
            href={`https://sepolia.arbiscan.io/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-vault-border bg-vault-bg px-4 py-2.5 text-xs font-bold text-cyan-400 hover:border-cyan-500/50 hover:text-cyan-300 transition-all whitespace-nowrap shadow-sm"
          >
            Verify on Arbiscan ↗
          </a>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-vault-border/80 bg-vault-bg/90 py-6 text-center text-xs text-slate-500">
        <p>EVault • Decentralized Web-Vault &amp; Enterprise Access Manager</p>
      </footer>
    </div>
  );
}
