"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import ConnectWallet from "./ConnectWallet";
import EVaultLogo from "./EVaultLogo";
import { useSession } from "./SessionContext";
import { CONTRACT_ADDRESS } from "@/lib/contract";
import ArchitectureShowcaseModal from "./ArchitectureShowcaseModal";
import NetworkStatusModal from "./NetworkStatusModal";

export default function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { token } = useSession();

  const [isArchOpen, setIsArchOpen] = useState(false);
  const [isNetOpen, setIsNetOpen] = useState(false);

  const chainLabel =
    chainId === 421614
      ? "Arbitrum Sepolia"
      : chainId === 31337
      ? "Hardhat Local"
      : "Chain 0x" + (chainId ? chainId.toString(16) : "---");

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-vault-border/80 bg-vault-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          {/* Left: Brand */}
          <div className="flex items-center gap-6">
            <EVaultLogo size="sm" />

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-1 text-xs font-semibold">
              <Link
                href="/"
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  pathname === "/"
                    ? "bg-slate-800/70 text-cyan-400 font-bold"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                }`}
              >
                Overview
              </Link>
              <Link
                href="/admin"
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  pathname === "/admin"
                    ? "bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                }`}
              >
                <span>🛡️</span>
                <span>Admin Console</span>
              </Link>
              <Link
                href="/user"
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  pathname === "/user"
                    ? "bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                }`}
              >
                <span>🔑</span>
                <span>Member Portal</span>
              </Link>
            </nav>
          </div>

          {/* Right: Quick actions & Wallet */}
          <div className="flex items-center gap-3">
            {/* Architecture Modal trigger */}
            <button
              onClick={() => setIsArchOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-vault-border bg-vault-surface/60 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-all shadow-sm"
              title="View cryptographic architecture & verification flow"
            >
              <span className="text-cyan-400">⚡</span>
              <span>Architecture</span>
            </button>

            {/* Network indicator trigger */}
            <button
              onClick={() => setIsNetOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-vault-border bg-vault-surface/60 px-2.5 py-1.5 text-xs text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 transition-all shadow-sm"
              title="View network and smart contract status"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="hidden sm:inline font-mono font-medium">{chainLabel}</span>
            </button>

            {/* SIWE Session Pill */}
            {isConnected && token && (
              <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>SIWE Verified</span>
              </div>
            )}

            {/* Wallet Connect */}
            <div className="scale-90 sm:scale-100 origin-right">
              <ConnectWallet />
            </div>
          </div>
        </div>
      </header>

      {/* Modals */}
      <ArchitectureShowcaseModal isOpen={isArchOpen} onClose={() => setIsArchOpen(false)} />
      <NetworkStatusModal isOpen={isNetOpen} onClose={() => setIsNetOpen(false)} />
    </>
  );
}
