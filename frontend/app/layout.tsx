import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM",
  description: "CRM built with Gin, Next.js, PostgreSQL, and Docker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
