import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { BrowserConsoleLogger } from "@/components/browser-console-logger";
import { InlineScript } from "@/components/inline-script";
import { DEFAULT_THEME, THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "unplan — Calendar, refined",
  description: "An open-source, keyboard-first calendar for the web.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <InlineScript html={THEME_BOOTSTRAP_SCRIPT} />
      </head>
      <body>
        {process.env.NODE_ENV === "development" && <BrowserConsoleLogger />}
        {children}
        <Toaster position="bottom-center" visibleToasts={10} closeButton richColors />
      </body>
    </html>
  );
}
