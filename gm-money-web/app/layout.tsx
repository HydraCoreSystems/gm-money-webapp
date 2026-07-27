import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeSync } from "@/components/ThemeSync";
import "./globals.css";

// Plain, synchronous inline script rather than next/script's
// beforeInteractive strategy -- confirmed live that beforeInteractive
// reliably failed to apply data-theme on /scheduled specifically (script
// content verified byte-identical to working pages, localStorage
// verified correct, no console errors -- it just silently never ran or
// never took effect on that route, across repeated hard reloads). A raw
// <script> in <head> executes synchronously in document order with no
// dependency on Next's own script-queueing runtime, which sidesteps
// whatever route-specific quirk that was.
const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  try {
    const storageKey = 'gm-money-theme';
    const savedTheme = window.localStorage.getItem(storageKey);
    const theme = savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
      ? savedTheme
      : 'system';

    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch {
    document.documentElement.removeAttribute('data-theme');
  }
})();
`;

// next/font self-hosts Inter at build time -- same font as the Vite app's
// Google Fonts <link>, but no runtime request to fonts.googleapis.com.
// globals.css's --font-body references "Inter" by name; applying this
// className is what actually registers/loads that self-hosted font.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "GM Money 2026",
  manifest: "/manifest.webmanifest",
  // iOS Safari's "Add to Home Screen" reads these meta tags (generated
  // automatically from this config), not manifest.json, to decide
  // whether the launched icon opens full-screen ("capable"), what the
  // status bar looks like, and what title to show under the icon.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GM Money 2026",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#244d3a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={inter.className}>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
