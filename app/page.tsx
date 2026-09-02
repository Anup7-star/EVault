import Link from "next/link";
import ConnectWallet from "@/components/ConnectWallet";
import VaultAccessMatrix from "@/components/VaultAccessMatrix";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-4 sm:px-6 py-12 text-center">
      {/* Top Header & Brand Logo */}
      <header className="flex flex-col items-center gap-4 max-w-2xl">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-500/10">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <rect x="9" y="11" width="6" height="5" rx="1" />
              <path d="M10 11V9a2 2 0 0 1 4 0v2" />
            </svg>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl font-sans">
            EVault
          </h1>
        </div>
        <p className="text-sm sm:text-base text-slate-400 max-w-lg">
          Decentralized Web-Vault &amp; Enterprise Access Manager powered by smart contracts and SIWE cryptography.
        </p>
      </header>

      {/* Wallet Connection Status */}
      <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-md shadow-xl">
        <ConnectWallet />
        <span className="text-xs text-slate-500 font-mono">
          Connect your Web3 wallet (e.g. MetaMask) to get started
        </span>
      </div>

      {/* Navigation Portals */}
      <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 text-left">
        {/* Admin Portal Card */}
        <Link
          href="/admin"
          className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-7 transition-all duration-300 hover:border-cyan-500/50 hover:bg-slate-900/70 hover:shadow-xl hover:shadow-cyan-500/10 focus-visible:outline-none"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 group-hover:scale-105 group-hover:border-cyan-400/60 group-hover:shadow-md transition-all">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white transition-colors group-hover:text-cyan-400">
            Admin Console
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Create new encrypted vaults, grant time-bound access to team wallets, and monitor access activity in real time.
          </p>
          <div className="mt-5 flex items-center gap-1.5 text-xs font-bold text-cyan-400 group-hover:text-cyan-300">
            <span>Open Admin Console</span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </div>
        </Link>

        {/* User Portal Card */}
        <Link
          href="/user"
          className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-7 transition-all duration-300 hover:border-amber-500/50 hover:bg-slate-900/70 hover:shadow-xl hover:shadow-amber-500/10 focus-visible:outline-none"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 group-hover:scale-105 group-hover:border-amber-400/60 group-hover:shadow-md transition-all">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white transition-colors group-hover:text-amber-400">
            Member Access Portal
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Sign in with your wallet signature to view confidential secrets and credentials that have been shared with you.
          </p>
          <div className="mt-5 flex items-center gap-1.5 text-xs font-bold text-amber-400 group-hover:text-amber-300">
            <span>View Shared Vaults</span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </div>
        </Link>
      </div>

      {/* Live Interactive Vault Access Matrix */}
      <section className="w-full text-left pt-6">
        <VaultAccessMatrix />
      </section>
    </main>
  );
}
