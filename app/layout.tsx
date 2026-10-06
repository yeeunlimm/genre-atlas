import type { Metadata } from "next";
import "./globals.css";
import "./youtube.css";
import "./studio.css";
import "./album-wall.css";
import "./music-ornaments.css";
import "./artist-cd-player.css";
import "./discovery-station.css";
import "./releases.css";
import "./station-learning.css";

export const metadata: Metadata = {
  title: "Genre Atlas — Music Discovery",
  description: "Discover related artists through YouTube Music. Explore verified genre tags and monthly audience.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
