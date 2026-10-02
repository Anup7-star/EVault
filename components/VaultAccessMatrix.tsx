"use client";

import React, { useState, useMemo } from "react";
import { useAccount } from "wagmi";

export type AccessGrantItem = {
  vaultId: string;
  vaultName: string;
  grantee: string;
  grantedAt: string;
  expiryTimestamp: number; // Unix epoch seconds
  status: "active" | "expired" | "revoked";
};

type VaultAccessMatrixProps = {
  grants?: AccessGrantItem[];
  onGrantAccess?: (vaultId: string, grantee: string, expirySeconds: number) => Promise<void>;
  onRevokeAccess?: (vaultId: string, grantee: string) => Promise<void>;
};

const DEFAULT_GRANTS: AccessGrantItem[] = [
  {
    vaultId: "0",
    vaultName: "Production DB Credentials",
    grantee: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    grantedAt: new Date(Date.now() - 3600000).toISOString(),
    expiryTimestamp: Math.floor((Date.now() + 7200000) / 1000),
    status: "active",
  },
  {
    vaultId: "1",
    vaultName: "Staging API Master Key",
    grantee: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    grantedAt: new Date(Date.now() - 86400000).toISOString(),
    expiryTimestamp: Math.floor((Date.now() - 3600000) / 1000),
    status: "expired",
  },
  {
    vaultId: "2",
    vaultName: "AWS KMS Root Tokens",
    grantee: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    grantedAt: new Date(Date.now() - 172800000).toISOString(),
    expiryTimestamp: Math.floor((Date.now() + 86400000) / 1000),
    status: "active",
  },
];

export default function VaultAccessMatrix({
  grants = DEFAULT_GRANTS,
  onGrantAccess,
  onRevokeAccess,
}: VaultAccessMatrixProps) {
  const { address, isConnected } = useAccount();
  const [items, setItems] = useState<AccessGrantItem[]>(grants);
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Grant Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formVaultId, setFormVaultId] = useState("");
  const [formGrantee, setFormGrantee] = useState("");
  const [selectedDurationHours, setSelectedDurationHours] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtered grants
  const filteredGrants = useMemo(() => {
    return items.filter((grant) => {
      const now = Math.floor(Date.now() / 1000);
      const isExpired = grant.expiryTimestamp <= now || grant.status === "expired";
      const currentStatus = grant.status === "revoked" ? "revoked" : isExpired ? "expired" : "active";

      if (filter === "active" && currentStatus !== "active") return false;
      if (filter === "expired" && currentStatus !== "expired") return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          grant.vaultName.toLowerCase().includes(query) ||
          grant.vaultId.toLowerCase().includes(query) ||
          grant.grantee.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [items, filter, searchQuery]);

  async function handleRevoke(vaultId: string, grantee: string) {
    if (onRevokeAccess) {
      await onRevokeAccess(vaultId, grantee);
    }
    setItems((prev) =>
      prev.map((g) =>
        g.vaultId === vaultId && g.grantee.toLowerCase() === grantee.toLowerCase()
          ? { ...g, status: "revoked" }
          : g
      )
    );
  }

  async function handleCreateGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!formVaultId || !formGrantee) return;
    setIsSubmitting(true);
    try {
      const expiryTimestamp = Math.floor(Date.now() / 1000) + selectedDurationHours * 3600;
      if (onGrantAccess) {
        await onGrantAccess(formVaultId, formGrantee, expiryTimestamp);
      }
      const newGrant: AccessGrantItem = {
        vaultId: formVaultId,
        vaultName: `Vault #${formVaultId}`,
        grantee: formGrantee,
        grantedAt: new Date().toISOString(),
        expiryTimestamp,
        status: "active",
      };
      setItems((prev) => [newGrant, ...prev]);
      setIsModalOpen(false);
      setFormVaultId("");
      setFormGrantee("");
    } finally {
      setIsSubmitting(false);
    }
  }

  function formatTimeRemaining(expiryEpochSeconds: number) {
    const diff = expiryEpochSeconds - Math.floor(Date.now() / 1000);
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h remaining`;
    if (hours > 0) return `${hours}h ${mins}m remaining`;
    return `${mins}m remaining`;
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
              Vault Access Matrix
            </h2>
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 text-xs font-mono font-semibold text-cyan-400">
              On-Chain Enforced
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Manage real-time address permissions &amp; time-bound cryptographic access grants.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold px-4 py-2.5 text-xs sm:text-sm shadow-lg shadow-cyan-500/20 transition-all duration-200 active:scale-95 touch-manipulation min-h-[44px]"
        >
          <span className="text-base">🔑</span>
          <span>Grant Access</span>
        </button>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
          {(["all", "active", "expired"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all min-h-[36px] ${
                filter === tab
                  ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder="Search by Vault ID, Name, or Wallet..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2 pl-9 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/40 min-h-[40px]"
          />
          <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
        </div>
      </div>

      {/* Access Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filteredGrants.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-slate-800 bg-slate-900/20 p-12 text-center backdrop-blur-md">
            <p className="text-slate-500 text-sm font-mono">No matching access grants found.</p>
          </div>
        ) : (
          filteredGrants.map((grant) => {
            const now = Math.floor(Date.now() / 1000);
            const isExpired = grant.expiryTimestamp <= now || grant.status === "expired";
            const isRevoked = grant.status === "revoked";
            const isActive = !isExpired && !isRevoked;

            return (
              <div
                key={`${grant.vaultId}-${grant.grantee}`}
                className={`group relative flex flex-col justify-between rounded-2xl border p-5 backdrop-blur-md transition-all duration-300 ${
                  isActive
                    ? "border-slate-800/80 bg-slate-900/30 hover:border-cyan-500/30 hover:shadow-[0_0_25px_rgba(6,182,212,0.1)]"
                    : isRevoked
                    ? "border-rose-500/20 bg-rose-950/10 opacity-75"
                    : "border-slate-800/40 bg-slate-950/40 opacity-75"
                }`}
              >
                <div className="space-y-3">
                  {/* Card Top: Vault ID & Status Pill */}
                  <div className="flex items-center justify-between">
                    <span className="rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 font-mono text-[10px] font-bold text-slate-400">
                      Vault #{grant.vaultId}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase border ${
                        isActive
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : isRevoked
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isActive ? "bg-emerald-400 animate-pulse" : isRevoked ? "bg-rose-400" : "bg-amber-400"
                        }`}
                      />
                      {isActive ? "Active" : isRevoked ? "Revoked" : "Expired"}
                    </span>
                  </div>

                  {/* Vault Title */}
                  <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                    {grant.vaultName}
                  </h3>

                  {/* Grantee Address */}
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-2.5 font-mono text-xs text-slate-300 space-y-1">
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      Grantee Wallet
                    </span>
                    <span className="block font-bold truncate" title={grant.grantee}>
                      {grant.grantee.slice(0, 8)}...{grant.grantee.slice(-6)}
                    </span>
                  </div>
                </div>

                {/* Card Bottom: Expiry Countdown & Revoke Action */}
                <div className="mt-5 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono">
                  <div className="text-slate-400">
                    <span className="block text-[10px] text-slate-500 uppercase">Time Status</span>
                    <span className={`font-semibold ${isActive ? "text-cyan-400" : "text-slate-500"}`}>
                      {formatTimeRemaining(grant.expiryTimestamp)}
                    </span>
                  </div>

                  {isActive && (
                    <button
                      onClick={() => handleRevoke(grant.vaultId, grant.grantee)}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 hover:border-rose-500/50 transition-all active:scale-95"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Grant Access */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-cyan-400">🔑</span> Grant Vault Permission
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-white transition text-base"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGrant} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Target Vault ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. 0"
                  value={formVaultId}
                  onChange={(e) => setFormVaultId(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition focus:border-cyan-500/40"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Grantee Wallet Address (0x...)
                </label>
                <input
                  type="text"
                  placeholder="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
                  value={formGrantee}
                  onChange={(e) => setFormGrantee(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs text-white font-mono placeholder-slate-500 outline-none transition focus:border-cyan-500/40"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Access Duration Presets
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "+1 Hour", hours: 1 },
                    { label: "+24 Hours", hours: 24 },
                    { label: "+7 Days", hours: 168 },
                    { label: "+30 Days", hours: 720 },
                  ].map((preset) => (
                    <button
                      key={preset.hours}
                      type="button"
                      onClick={() => setSelectedDurationHours(preset.hours)}
                      className={`rounded-xl border py-2 text-[11px] font-mono font-semibold transition ${
                        selectedDurationHours === preset.hours
                          ? "border-cyan-500 bg-cyan-500/20 text-cyan-300"
                          : "border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-950/40 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 py-2.5 text-xs font-bold text-slate-950 transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Confirm Grant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
