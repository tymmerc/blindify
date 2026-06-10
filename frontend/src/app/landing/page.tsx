import { CTA } from "@/components/landing/cta"
import { Features } from "@/components/landing/features"
import { Footer } from "@/components/landing/footer"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Navigation } from "@/components/landing/navigation"
import { Pricing } from "@/components/landing/pricing"

export default function LandingPage() {
  return (
    <div className="relative bg-[#09090b] text-[#fafafa]">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_10%,rgba(168,85,247,0.12),transparent_40%)]"
        aria-hidden
      />
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
