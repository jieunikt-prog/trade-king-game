import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "우리가 무역왕!",
  description: "모둠별로 실시간 거래하며 산업을 발전시키는 교실 무역 게임",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
