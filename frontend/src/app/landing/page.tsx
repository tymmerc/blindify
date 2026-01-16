import { CTA } from "@/components/landing/cta"
import { Features } from "@/components/landing/features"
import { Footer } from "@/components/landing/footer"
import { Hero } from "@/components/landing/hero"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Navigation } from "@/components/landing/navigation"
import { Pricing } from "@/components/landing/pricing"

export default function LandingPage() {
  return (
    <div className="relative bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(168,85,247,0.18),transparent_36%),radial-gradient(circle_at_80%_15%,rgba(34,197,94,0.14),transparent_30%),radial-gradient(circle_at_50%_75%,rgba(236,72,153,0.16),transparent_34%)]"
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
