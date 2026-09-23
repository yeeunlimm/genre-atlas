import type { Metadata } from "next";
import "./globals.css";
import "./youtube.css";
import "./studio.css";
import "./album-wall.css";
import "./cassette-collage.css";

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
