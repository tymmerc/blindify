import { CTA } from "@/components/landing/cta"
import { Features } from "@/components/landing/features"
import { Footer } from "@/components/landing/footer"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Navigation } from "@/components/landing/navigation"
import { Pricing } from "@/components/landing/pricing"

export default function LandingPage() {
  return (
    <div className="relative text-[#2e2014]">
      <Navigation />
      <main className="relative pt-24">
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
