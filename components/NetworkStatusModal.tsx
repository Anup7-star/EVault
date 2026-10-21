"use client";

import React, { useEffect, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { CONTRACT_ADDRESS } from "@/lib/contract";
import { useSession } from "./SessionContext";

export default function NetworkStatusModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { token, status: authStatus } = useSession();

  const [backendHealth, setBackendHealth] = useState<"checking" | "ok" | "unreachable">("checking");
  const [copiedContract, setCopiedContract] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
    setBackendHealth("checking");
    fetch(`${backendUrl}/health`)
      .then((res) => {
        if (res.ok) setBackendHealth("ok");
        else setBackendHealth("unreachable");
      })
      .catch(() => setBackendHealth("unreachable"));
  }, [isOpen]);

  if (!isOpen) return null;

  const isArbitrum = chainId === 421614;
  const isHardhat = chainId === 31337;

  function copyText(text: string, type: "contract" | "wallet") {
    navigator.clipboard.writeText(text);
    if (type === "contract") {
      setCopiedContract(true);
      setTimeout(() => setCopiedContract(false), 2000);
    } else {
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl rounded-2xl border border-vault-border bg-vault-surface p-6 sm:p-7 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-vault-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 text-base">
              🌐
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">Network &amp; Deployment Status</h2>
              <p className="text-xs text-slate-400">Live connectivity across blockchain and Rust backend</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-vault-border p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Rows */}
        <div className="mt-5 space-y-3.5 text-xs">
          {/* Blockchain Node */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-vault-border bg-vault-card">
            <div>
              <span className="font-semibold text-white block">Blockchain Network</span>
              <span className="text-slate-400 font-mono">
                {isArbitrum
                  ? "Arbitrum Sepolia Testnet"
                  : isHardhat
                  ? "Hardhat Local Node"
                  : `Custom Chain (${chainId || "Not connected"})`}
              </span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                isConnected
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>

          {/* Smart Contract */}
          <div className="p-3.5 rounded-xl border border-vault-border bg-vault-card">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-white">AccessControl Contract</span>
              <button
                onClick={() => copyText(CONTRACT_ADDRESS, "contract")}
                className="text-cyan-400 hover:text-cyan-300 font-medium"
              >
                {copiedContract ? "Copied!" : "Copy Address"}
              </button>
            </div>
            <p className="font-mono text-[11px] text-slate-300 break-all select-all bg-black/40 p-2 rounded border border-vault-border/60">
              {CONTRACT_ADDRESS}
            </p>
          </div>

          {/* Rust Backend API */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-vault-border bg-vault-card">
            <div>
              <span className="font-semibold text-white block">Rust Axum Backend</span>
              <span className="text-slate-400 font-mono">
                {process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"}
              </span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                backendHealth === "ok"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : backendHealth === "checking"
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {backendHealth === "ok"
                ? "Online"
                : backendHealth === "checking"
                ? "Checking..."
                : "Offline / Unreachable"}
            </span>
          </div>

          {/* SIWE Session */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-vault-border bg-vault-card">
            <div>
              <span className="font-semibold text-white block">SIWE Session Token</span>
              <span className="text-slate-400">
                {token ? "Active Cryptographic Session" : "No active session"}
              </span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                token
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              {token ? "Authenticated" : "Unauthenticated"}
            </span>
          </div>

          {/* Connected Wallet */}
          {address && (
            <div className="p-3.5 rounded-xl border border-vault-border bg-vault-card">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-white">Connected Wallet Address</span>
                <button
                  onClick={() => copyText(address, "wallet")}
                  className="text-cyan-400 hover:text-cyan-300 font-medium"
                >
                  {copiedWallet ? "Copied!" : "Copy Address"}
                </button>
              </div>
              <p className="font-mono text-[11px] text-slate-300 break-all select-all bg-black/40 p-2 rounded border border-vault-border/60">
                {address}
              </p>
            </div>
          )}
        </div>

        {/* Close Button */}
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-vault-border/70 hover:bg-vault-border py-2.5 text-xs font-bold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
