import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

import { AudioLifecycleGuard } from "@/components/system/AudioLifecycleGuard"
import { ModeProvider } from "@/contexts/ModeContext"
import { publicPath } from "@/lib/publicPath"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Blindify — Play your music differently",
  description:
    "Connect your favorite music services and battle friends in a neon-soaked blind test experience with universal audio sources.",
  icons: {
    icon: [
      { url: publicPath("/favicon.ico") },
      { url: publicPath("/favicon-32x32.png"), sizes: "32x32", type: "image/png" },
      { url: publicPath("/favicon-16x16.png"), sizes: "16x16", type: "image/png" },
    ],
    apple: publicPath("/apple-touch-icon.png"),
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased min-h-screen`}>
        <div className="fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#090915] via-[#0a0a12] to-[#050510]" />
        </div>
        <ModeProvider>
          <AudioLifecycleGuard />
          {children}
        </ModeProvider>
      </body>
    </html>
  )
}
