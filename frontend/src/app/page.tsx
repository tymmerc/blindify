import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import CTA from "@/components/landing/CTA";

export default function LandingPage() {
  return (
    <main data-theme="light" className="min-h-screen bg-gradient-to-b from-white to-purple-50 text-gray-800">
      <Hero />
      <Features />
      <HowItWorks />
      <CTA />
    </main>
  );
}
