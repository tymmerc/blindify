import type React from "react"
import type { Metadata } from "next"
import { Space_Grotesk, JetBrains_Mono, Audiowide } from "next/font/google"
import "./globals.css"
import "@/styles/theme-variables.css"

import { AudioLifecycleGuard } from "@/components/system/AudioLifecycleGuard"
import { ModeProvider } from "@/contexts/ModeContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { publicPath } from "@/lib/publicPath"

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
})

const audiowide = Audiowide({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Blindify — Jouez votre musique autrement",
  description:
    "Connectez vos services de musique préférés et défiez vos amis dans un blind test immersif aux couleurs néon.",
  icons: {
    icon: [
      { url: publicPath("/favicon.ico") },
      { url: publicPath("/favicon-32x32.png"), sizes: "32x32", type: "image/png" },
      { url: publicPath("/favicon-16x16.png"), sizes: "16x16", type: "image/png" },
    ],
    apple: publicPath("/apple-touch-icon.png"),
  },
  openGraph: {
    title: "Blindify — Jouez votre musique autrement",
    description:
      "Connectez vos services de musique préférés et défiez vos amis dans un blind test immersif aux couleurs néon.",
    type: "website",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blindify — Jouez votre musique autrement",
    description:
      "Connectez vos services de musique préférés et défiez vos amis dans un blind test immersif aux couleurs néon.",
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
            __html: `document.documentElement.setAttribute("data-theme","dark")`,
          }}
        />
      </head>
      <body className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${audiowide.variable} font-sans antialiased min-h-screen`}>
        {/* Synthwave background — sun + horizon glow above the grid (grid itself
            is drawn by body::after in globals.css). */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-[#0a0014]" />
          {/* "Sun" disc at horizon */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-[40vh] w-[420px] h-[420px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(255,46,200,0.55) 0%, rgba(168,85,247,0.25) 35%, transparent 65%)",
              filter: "blur(8px)",
            }}
          />
          {/* Top atmosphere wash */}
          <div className="absolute top-0 left-0 right-0 h-[40vh] bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.18),transparent_70%)]" />
        </div>
        <ThemeProvider>
          <ModeProvider>
            <AudioLifecycleGuard />
            {children}
          </ModeProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
