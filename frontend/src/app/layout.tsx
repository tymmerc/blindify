import type React from "react"
import type { Metadata, Viewport } from "next"
import { Karla, JetBrains_Mono, Fraunces } from "next/font/google"
import "./globals.css"
import "@/styles/theme-variables.css"

import { AudioLifecycleGuard } from "@/components/system/AudioLifecycleGuard"
import { BugReportDialog } from "@/components/BugReportDialog"
import { ModeProvider } from "@/contexts/ModeContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { publicPath } from "@/lib/publicPath"

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
})

export const viewport: Viewport = {
  themeColor: "#c65133",
  // App installee : occupe tout l'ecran, sous la barre de statut (encoche iPhone).
  viewportFit: "cover",
}

const SEO_TITLE = "Blindz · Le blind test avec VOS musiques, entre potes"
const SEO_DESC =
  "Le blind test avec VOS propres musiques. Importe tes playlists Spotify ou Deezer, devine les titres entre potes, autour d'une table ou à distance. Gratuit, rien à installer."

export const metadata: Metadata = {
  metadataBase: new URL("https://blindz.app"),
  applicationName: "Blindz",
  title: {
    default: SEO_TITLE,
    // Les pages internes deviennent "… · Blindz" ; l'accueil garde le titre complet.
    template: "%s · Blindz",
  },
  description: SEO_DESC,
  keywords: [
    "blind test",
    "blindtest",
    "blind test musique",
    "blind test avec ses musiques",
    "blind test entre potes",
    "blind test soirée",
    "jeu blind test",
    "quiz musical",
    "deviner des chansons",
    "blind test Spotify",
    "blind test Deezer",
  ],
  alternates: { canonical: "https://blindz.app/" },
  manifest: publicPath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "Blindz",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: publicPath("/favicon.ico") },
      { url: publicPath("/favicon-32x32.png"), sizes: "32x32", type: "image/png" },
      { url: publicPath("/favicon-16x16.png"), sizes: "16x16", type: "image/png" },
    ],
    apple: publicPath("/apple-touch-icon.png"),
  },
  openGraph: {
    siteName: "Blindz",
    title: SEO_TITLE,
    description: SEO_DESC,
    url: "https://blindz.app/",
    type: "website",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: SEO_TITLE,
    description: SEO_DESC,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.setAttribute("data-theme","dark");
            /* Tue tout ancien service worker PWA qui sert un cache perime et empeche les MAJ. */
            if ("serviceWorker" in navigator) {
              navigator.serviceWorker.getRegistrations().then(function(rs){
                if (rs && rs.length) {
                  rs.forEach(function(r){ r.unregister(); });
                  if (window.caches) { caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); }); }
                }
              }).catch(function(){});
            }`,
          }}
        />
        {/* Donnees structurees : Google comprend que Blindz est un jeu de blind test. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Blindz",
              alternateName: "Blindz - Blind test",
              url: "https://blindz.app/",
              description: SEO_DESC,
              applicationCategory: "GameApplication",
              operatingSystem: "Web",
              inLanguage: "fr",
              offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
            }),
          }}
        />
      </head>
      <body className={`${karla.variable} ${jetbrainsMono.variable} ${fraunces.variable} font-sans antialiased min-h-screen`}>
        {/* Club analogique : base papier creme, le grain est pose par globals.css */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-[#f4ecdb]" />
        </div>
        <ThemeProvider>
          <ModeProvider>
            <AudioLifecycleGuard />
            {children}
            <BugReportDialog />
          </ModeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
