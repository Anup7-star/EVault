import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import { Outfit } from "next/font/google";

const outfit = Outfit({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#030712",
};

export const metadata: Metadata = {
  title: "EVault | Decentralized Web-Vault",
  description: "EVault - Decentralized Web-Vault & Enterprise Access Manager with on-chain access enforcement",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${outfit.className} bg-vault-bg relative overflow-x-hidden antialiased min-h-screen`}>
        {/* Glow Effects */}
        <div className="pointer-events-none absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="pointer-events-none absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-cyan-600/10 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 left-1/3 h-[600px] w-[600px] rounded-full bg-indigo-600/10 blur-[120px]" />
        
        <div className="relative z-10">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
