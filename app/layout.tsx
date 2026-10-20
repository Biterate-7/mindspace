import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Silkscreen } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "Mindspace — Put your brain on a map",
  description: "Turn topics, essays and brain dumps into an interactive galaxy of connected ideas. Runs entirely in your browser.",
  applicationName: "Mindspace",
};

export const viewport: Viewport = {
  themeColor: "#03040a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${silkscreen.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
