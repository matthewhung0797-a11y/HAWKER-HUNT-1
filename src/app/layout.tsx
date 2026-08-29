import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import DevConsole from "@/components/DevConsole";
import GlobalPressFx from "@/components/GlobalPressFx";
import AnalyticsInit from "@/components/AnalyticsInit";
import CloudSaveInit from "@/components/CloudSaveInit";
import InstallPrompt from "@/components/InstallPrompt";
import "./globals.css";

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const metadata: Metadata = {
  title: "Hawker Hunt",
  description:
    "Turn every hawker centre into your food hunting ground — no download needed, scan and play.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hawker Hunt",
  },
};

// Responsive viewport — adapts to any device width
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#b03a2e",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale === "zh" ? "zh-Hant" : "en"}
      className={`${notoSansTC.variable} h-full antialiased`}
    >
      <head>
        {/* Polyfills for older WebView browsers */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Object.hasOwn polyfill (Chrome < 93)
              if (!Object.hasOwn) {
                Object.hasOwn = function(obj, prop) {
                  return Object.prototype.hasOwnProperty.call(obj, prop);
                };
              }
              // structuredClone polyfill (Chrome < 98)
              if (typeof structuredClone === 'undefined') {
                window.structuredClone = function(obj) {
                  return JSON.parse(JSON.stringify(obj));
                };
              }
              // Array.prototype.at polyfill (Chrome < 92)
              if (!Array.prototype.at) {
                Array.prototype.at = function(n) {
                  n = Math.trunc(n) || 0;
                  if (n < 0) n += this.length;
                  if (n < 0 || n >= this.length) return undefined;
                  return this[n];
                };
              }
              // Fix viewport for Unity WebView
              if (window.innerWidth > 600) {
                var m = document.querySelector('meta[name=viewport]');
                if (m) {
                  m.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
                }
              }
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col paper-texture">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <GlobalPressFx />
          <AnalyticsInit />
          <CloudSaveInit />
          <InstallPrompt />
          <DevConsole />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
