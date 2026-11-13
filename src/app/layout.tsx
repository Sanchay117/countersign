import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Caveat, Courier_Prime, Instrument_Sans, Mrs_Saint_Delafield } from "next/font/google";
import "./globals.css";

const display = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-display", display: "swap" });
const text = Instrument_Sans({ subsets: ["latin"], variable: "--font-text", display: "swap" });
const typed = Courier_Prime({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-typed", display: "swap" });
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand", display: "swap" });
const autograph = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", variable: "--font-autograph", display: "swap" });

const description = "The second signature on every payment your AI agent makes. Each x402 payment on Kite is checked against your instructions by SERV Reasoning before the wallet signs.";

export const metadata: Metadata = {
  title: "Countersign: the second signature on every agent payment",
  description,
  openGraph: { title: "Countersign", description, type: "website" },
  twitter: { card: "summary_large_image", title: "Countersign", description },
};

export const viewport: Viewport = { themeColor: "#e9ede1", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${typed.variable} ${hand.variable} ${autograph.variable}`}>
      <body>{children}</body>
    </html>
  );
}
