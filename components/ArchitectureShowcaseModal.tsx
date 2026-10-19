"use client";

import React from "react";
import { CONTRACT_ADDRESS } from "@/lib/contract";

export default function ArchitectureShowcaseModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const steps = [
    {
      num: "01",
      badge: "Authentication",
      title: "SIWE Cryptographic Challenge",
      desc: "Users authenticate without passwords via EIP-4361 Sign-In with Ethereum. The Rust backend generates single-use nonces bound to domain and chain ID.",
      color: "from-cyan-500/20 to-blue-500/10",
      borderColor: "border-cyan-500/30",
      textColor: "text-cyan-400",
    },
    {
      num: "02",
      badge: "On-Chain Registry",
      title: "Solidity Access Control",
      desc: "Vault registrations and time-bound grantee permissions are submitted as immutable transactions to Arbitrum Sepolia / Hardhat.",
      color: "from-emerald-500/20 to-teal-500/10",
      borderColor: "border-emerald-500/30",
      textColor: "text-emerald-400",
    },
    {
      num: "03",
      badge: "Decryption Gate",
      title: "Fail-Closed Smart Contract Query",
      desc: "When a member requests secret reveal, the Rust Axum backend live-queries the smart contract. If revoked or expired, decryption fails closed with 403.",
      color: "from-amber-500/20 to-orange-500/10",
      borderColor: "border-amber-500/30",
      textColor: "text-amber-400",
    },
    {
      num: "04",
      badge: "Hardware-Grade Encryption",
      title: "AES-256-GCM at Rest",
      desc: "Secret payload is encrypted using AES-256-GCM with a unique 96-bit random nonce before database insertion. Plaintext never touches PostgreSQL disk.",
      color: "from-purple-500/20 to-indigo-500/10",
      borderColor: "border-purple-500/30",
      textColor: "text-purple-400",
    },
    {
      num: "05",
      badge: "Accountability",
      title: "Real-Time Audit Trail",
      desc: "Every creation, grant, revoke, decryption attempt, and auth challenge is recorded in PostgreSQL with timestamp, actor wallet, and event metadata.",
      color: "from-rose-500/20 to-pink-500/10",
      borderColor: "border-rose-500/30",
      textColor: "text-rose-400",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-vault-border bg-vault-surface p-6 sm:p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-vault-border pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-0.5 text-xs font-semibold text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Verified Architecture
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight sm:text-3xl font-sans">
              Decentralized EVault Architecture
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Smart-contract enforced access control with zero-trust backend decryption.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-vault-border p-2 text-slate-400 hover:border-slate-600 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Steps Grid */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {steps.map((s, idx) => (
            <div
              key={idx}
              className={`rounded-xl border ${s.borderColor} bg-gradient-to-br ${s.color} p-5 flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-mono font-bold tracking-widest ${s.textColor}`}>
                    {s.num} / {s.badge}
                  </span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-black/30 text-slate-300">
                    Live Verified
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mb-1.5">{s.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}

          {/* Security Properties Summary Card */}
          <div className="rounded-xl border border-vault-border bg-vault-card p-5 flex flex-col justify-between">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <span>🛡️</span> Key Security Invariants
            </h3>
            <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
              <li>No passwords or recovery seed stored on server.</li>
              <li>Every reveal re-checks blockchain on-chain state live.</li>
              <li>Admin cannot bypass grant requirement for secret reads.</li>
              <li>Automatic expiration enforcement at timestamp precision.</li>
              <li>Encrypted with AES-256-GCM hardware-accelerated ciphers.</li>
            </ul>
          </div>
        </div>

        {/* Contract Info Footer */}
        <div className="mt-6 rounded-xl border border-vault-border/80 bg-vault-bg p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">Live Sepolia Contract:</span>
            <span className="font-mono text-cyan-400 break-all">{CONTRACT_ADDRESS}</span>
          </div>
          <a
            href={`https://sepolia.arbiscan.io/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-cyan-400 hover:text-cyan-300 hover:underline whitespace-nowrap"
          >
            <span>View on Arbiscan</span>
            <span>↗</span>
          </a>
        </div>
      </div>
    </div>
  );
}
