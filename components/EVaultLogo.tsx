import React from "react";
import Link from "next/link";

export default function EVaultLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const iconSizes = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-12 h-12",
  };

  const textSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
  };

  return (
    <Link href="/" className="inline-flex items-center gap-2.5 group focus-visible:outline-none">
      <div className={`relative flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 via-emerald-500/10 to-transparent border border-cyan-500/30 text-cyan-400 shadow-md shadow-cyan-500/10 group-hover:border-cyan-400 group-hover:shadow-cyan-500/20 transition-all ${iconSizes[size]}`}>
        <svg className="w-5/6 h-5/6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" className="text-cyan-400" />
          <rect x="9" y="11" width="6" height="5" rx="1" className="text-emerald-400" />
          <path d="M10 11V9a2 2 0 0 1 4 0v2" className="text-emerald-400" />
        </svg>
        <span className="absolute -top-1 -right-1 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      </div>
      <div className="flex flex-col text-left">
        <span className={`font-extrabold tracking-tight text-white font-sans ${textSizes[size]}`}>
          E<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">Vault</span>
        </span>
        <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 -mt-1">
          Zero-Trust Web3
        </span>
      </div>
    </Link>
  );
}
