import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

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
    icon: "/favicon.ico",
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
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,0.18),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(34,197,94,0.2),transparent_52%),linear-gradient(135deg,#050510_0%,#090922_40%,#030109_100%)]" />
          <div className="absolute inset-0 backdrop-blur-[2px]" />
        </div>
        {children}
      </body>
    </html>
  )
}
