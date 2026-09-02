import Link from "next/link";
import ConnectWallet from "@/components/ConnectWallet";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-12 px-6 py-16 text-center">
      {/* Top Header & Brand Logo */}
      <header className="flex flex-col items-center gap-4 max-w-2xl">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warm-surface border border-amber-500/30 text-amber-400 shadow-md">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <rect x="9" y="11" width="6" height="5" rx="1" />
              <path d="M10 11V9a2 2 0 0 1 4 0v2" />
            </svg>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-warm-cream sm:text-6xl font-sans">
            EVault
          </h1>
        </div>
      </header>

      {/* Wallet Connection Status */}
      <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-warm-border bg-warm-surface p-4 shadow-sm">
        <ConnectWallet />
        <span className="text-xs text-warm-muted font-sans">
          Connect your Web3 wallet (e.g. MetaMask) to get started
        </span>
      </div>

      {/* Navigation Portals */}
      <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 text-left">
        {/* Admin Portal Card */}
        <Link
          href="/admin"
          className="group relative overflow-hidden rounded-2xl border border-warm-border bg-warm-surface p-7 transition-all duration-200 hover:border-amber-500/40 hover:bg-warm-card hover:shadow-xl hover:shadow-amber-950/20 focus-visible:outline-none"
        >
          {/* Custom Admin Logo Badge */}
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warm-card text-amber-400 border border-amber-500/30 group-hover:scale-105 group-hover:border-amber-400/60 group-hover:shadow-md transition-all">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-warm-text transition-colors group-hover:text-amber-400">
            Admin Console
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-warm-muted">
            Create new encrypted vaults, grant time-bound access to team wallets, and monitor access activity in real time.
          </p>
          <div className="mt-5 flex items-center gap-1.5 text-xs font-bold text-amber-400 group-hover:text-amber-300">
            <span>Open Admin Console</span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </div>
        </Link>

        {/* User Portal Card */}
        <Link
          href="/user"
          className="group relative overflow-hidden rounded-2xl border border-warm-border bg-warm-surface p-7 transition-all duration-200 hover:border-orange-500/40 hover:bg-warm-card hover:shadow-xl hover:shadow-orange-950/20 focus-visible:outline-none"
        >
          {/* Custom Member Keycard Logo Badge */}
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warm-card text-orange-400 border border-orange-500/30 group-hover:scale-105 group-hover:border-orange-400/60 group-hover:shadow-md transition-all">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-warm-text transition-colors group-hover:text-orange-400">
            Member Access Portal
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-warm-muted">
            Sign in with your wallet signature to view confidential secrets and credentials that have been shared with you.
          </p>
          <div className="mt-5 flex items-center gap-1.5 text-xs font-bold text-orange-400 group-hover:text-orange-300">
            <span>View Shared Vaults</span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </div>
        </Link>
      </div>

    </main>
  );
}
