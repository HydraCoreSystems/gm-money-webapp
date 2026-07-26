import type { Metadata } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import "./globals.css";

// next/font self-hosts Inter at build time -- same font as the Vite app's
// Google Fonts <link>, but no runtime request to fonts.googleapis.com.
// globals.css's --font-body references "Inter" by name; applying this
// className is what actually registers/loads that self-hosted font.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "GM Money",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="gm-money-theme-bootstrap" strategy="beforeInteractive">{`
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
        `}</Script>
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
