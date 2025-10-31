"use client"

import Hero from "@/components/landing/Hero"
import Features from "@/components/landing/Features"
import HowItWorks from "@/components/landing/HowItWorks"
import CTA from "@/components/landing/CTA"
import Navbar from "@/components/ui/Navbar"
import LayoutGradient from "@/components/ui/LayoutGradient"

export default function Home() {
  return (
    <LayoutGradient>
      <Navbar />
      <main className="flex flex-col items-center justify-center text-center min-h-screen">
        <Hero />
        <Features />
        <HowItWorks />
        <CTA />
      </main>
    </LayoutGradient>
  )
}
