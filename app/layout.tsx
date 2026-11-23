import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/ui/Providers";

export const metadata: Metadata = {
  title: "The Bots Must Be Crazy",
  description: "A small world where every creature is born the way a real baby is born this year, and a mind costs real money.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&family=VT323&family=IBM+Plex+Sans:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
