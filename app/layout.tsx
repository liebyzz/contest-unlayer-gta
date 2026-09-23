import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEON WALLS — the city is your canvas",
  description:
    "A GTA-inspired open-world graffiti game where the Unlayer React Image Editor IS the spray can. Find a wall, open the studio, paint it, and see your piece live in the city.",
};

export const viewport: Viewport = {
  themeColor: "#07050c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/*
          Deliberately a plain stylesheet link rather than `next/font`.
          The city's signage, the shouted lines and all fourteen surface
          photographs are text rasterised onto a 2D canvas, and those call sites
          name `Anton` and `Inter` literally. `next/font` rewrites both to a
          generated family that canvas cannot resolve, so every one of them
          would silently fall back to Impact. See `lib/game/fonts.ts`.
        */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&family=Permanent+Marker&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full overflow-hidden bg-ink text-paper select-none">
        {children}
      </body>
    </html>
  );
}
