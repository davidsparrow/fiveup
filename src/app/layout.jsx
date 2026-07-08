/* eslint-disable @next/next/no-page-custom-font */
import "./globals.css";

import { getSiteUrl } from "@/lib/fivestarz/site";

export const metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "ProofSignals — Honest feedback from founders who actually get it.",
  description:
    "A trusted founder feedback network. Post your asset, get meaningful human feedback, build trust, and publish public proof only when you choose.",
  openGraph: {
    title: "ProofSignals — Honest feedback from founders who actually get it.",
    description:
      "AI helps you present your asset. Humans provide the feedback. Public proof is optional and earned.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,800;0,9..144,900&family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
