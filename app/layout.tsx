import type { Metadata } from "next";
import "./globals.css";
import "./youtube.css";
import "./analog.css";

export const metadata: Metadata = {
  title: "Genre Atlas · 장르로 만나는 다음 가수",
  description: "YouTube Music의 비슷한 가수와 월간 청중 수로 발견하는 다음 음악 취향. 장르 정보는 나무위키로 보완합니다.",
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
