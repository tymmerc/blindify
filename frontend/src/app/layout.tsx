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

const SEO_TITLE = "blindz.app · Le blind test avec VOS musiques, entre potes"
const SEO_DESC =
  "Le blind test avec VOS propres musiques. Importe tes playlists Spotify ou Deezer, devine les titres entre potes, autour d'une table ou à distance. Gratuit, rien à installer."

export const metadata: Metadata = {
  metadataBase: new URL("https://blindz.app"),
  applicationName: "blindz.app",
  title: {
    default: SEO_TITLE,
    // Les pages internes deviennent "… · Blindz" ; l'accueil garde le titre complet.
    template: "%s · blindz.app",
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
  // Pas de canonical global : herite par toutes les pages, il declarait /faq/,
  // /mentions-legales/ etc. comme des copies de la home (desindexation). Chaque
  // page de contenu pose le sien (metadataBase resout les chemins relatifs).
  manifest: publicPath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "blindz.app",
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
    siteName: "blindz.app",
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
        {/* Nom de site pour les resultats de recherche (le "blindz.app" a cote du
            favicon) : Google le lit dans un WebSite avec name + alternateName. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "blindz.app",
              alternateName: ["Blindz app"],
              url: "https://blindz.app/",
              inLanguage: "fr",
            }),
          }}
        />
        {/* Donnees structurees : Google comprend que blindz.app est un jeu de blind test. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "blindz.app",
              alternateName: ["Blindz app", "blindz.app blind test"],
              url: "https://blindz.app/",
              description: SEO_DESC,
              applicationCategory: "GameApplication",
              operatingSystem: "Web",
              inLanguage: "fr",
              offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
              // Ce qui differencie Blindz, en clair pour les moteurs et les IA.
              featureList: [
                "Blind test généré automatiquement à partir des playlists Spotify ou Deezer des joueurs",
                "Aucun quiz à préparer, aucune playlist imposée",
                "Deviner qui a ajouté chaque morceau",
                "Mode autour d'une table avec écran central et QR code, jusqu'à 12 joueurs",
                "Mode un seul téléphone à doigt posé, jusqu'à 5 joueurs",
                "Mode à distance avec code à 6 caractères et chat, jusqu'à 12 joueurs",
                "Spotify et Deezer mélangés dans la même partie",
                "Gratuit, sans compte, dans le navigateur",
              ],
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
