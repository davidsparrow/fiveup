import "./globals.css";

export const metadata = {
  title: "FiveStarz — Real reviews, earned together.",
  description:
    "A members-only club where founders and solopreneurs exchange honest, ethical feedback — and decide together whether to share it as a real review.",
  openGraph: {
    title: "FiveStarz — Real reviews, earned together.",
    description:
      "A members-only club where founders and solopreneurs exchange honest, ethical feedback.",
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
