import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { DisableBrowserZoom } from "@/components/disable-browser-zoom";
import { ElectronTitleBar } from "@/components/electron-title-bar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Modern Markdown Editor",
  description: "A modern markdown editor with AI assistance",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <DisableBrowserZoom />
          <div className="flex flex-col h-screen overflow-hidden">
            <ElectronTitleBar />
            <div className="flex-1 min-h-0 overflow-hidden">
              {children}
            </div>
          </div>
          {/* Global KaTeX styles for math rendering in editors */}
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.27/dist/katex.min.css" crossOrigin="anonymous" />
        </ThemeProvider>
      </body>
    </html>
  );
}
