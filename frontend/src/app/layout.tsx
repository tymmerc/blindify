import type React from "react"
import type { Metadata } from "next"
import { Karla, JetBrains_Mono, Fraunces } from "next/font/google"
import "./globals.css"
import "@/styles/theme-variables.css"

import { AudioLifecycleGuard } from "@/components/system/AudioLifecycleGuard"
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

export const metadata: Metadata = {
  title: "Blindify — Jouez votre musique autrement",
  description:
    "Connectez vos services de musique préférés et défiez vos amis dans un blind test qui sent le vinyle et le café.",
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
      "Connectez vos services de musique préférés et défiez vos amis dans un blind test qui sent le vinyle et le café.",
    type: "website",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blindify — Jouez votre musique autrement",
    description:
      "Connectez vos services de musique préférés et défiez vos amis dans un blind test qui sent le vinyle et le café.",
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
      <body className={`${karla.variable} ${jetbrainsMono.variable} ${fraunces.variable} font-sans antialiased min-h-screen`}>
        {/* Club analogique : base papier creme, le grain est pose par globals.css */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-[#f4ecdb]" />
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
