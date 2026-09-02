"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";

export default function ConnectWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const [mounted, setMounted] = useState(false);
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-10 w-32 animate-pulse rounded-xl bg-slate-800/50" />
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Active Chain Badge */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs font-mono text-slate-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{chain?.name || (chainId === 31337 ? "Hardhat Local" : "Chain #" + chainId)}</span>
        </div>

        {/* Address Badge */}
        <div className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-mono text-indigo-300 backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-indigo-400" />
          <span>{address.slice(0, 4)}...{address.slice(-4)}</span>
        </div>

        {/* Disconnect Button */}
        <button
          onClick={() => disconnect()}
          className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white transition-all active:scale-95 touch-manipulation min-h-[38px]"
          title="Disconnect Wallet"
        >
          Disconnect
        </button>
      </div>
    );
  }

  async function handleConnect() {
    setErrorMessage(null);
    if (connectors && connectors.length > 0) {
      try {
        connect({ connector: connectors[0] });
      } catch (err: any) {
        setErrorMessage(err.shortMessage || err.message || "Failed to connect wallet.");
      }
    } else {
      setShowMobileModal(true);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleConnect}
        disabled={isPending}
        className="group relative flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-95 disabled:opacity-50 touch-manipulation min-h-[44px]"
      >
        <span className="text-base">👛</span>
        <span>{isPending ? "Connecting..." : "Connect Wallet"}</span>
      </button>

      {errorMessage && (
        <p className="text-[11px] text-rose-400 font-mono text-center max-w-xs">
          {errorMessage}
        </p>
      )}

      {showMobileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-2xl text-amber-400 border border-amber-500/20">
              📲
            </div>
            <h3 className="text-lg font-bold text-white">Connect Wallet</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              If you are on a mobile device, please open this app inside your wallet's built-in browser (e.g. <strong>MetaMask Mobile</strong> or <strong>Trust Wallet</strong>).
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <a
                href={`https://metamask.app.link/dapp/${typeof window !== "undefined" ? window.location.host : ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
              >
                Open in MetaMask Mobile
              </a>
              <button
                onClick={() => setShowMobileModal(false)}
                className="w-full rounded-xl border border-slate-800 py-2 text-xs text-slate-400 hover:text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
