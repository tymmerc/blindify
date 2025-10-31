#!/bin/bash
set -e

echo "🚀 Setting up Blindify dual-theme structure (Landing + App)..."

# Ensure we're inside frontend
cd "$(dirname "$0")"

mkdir -p src/app/app
mkdir -p src/components/landing
mkdir -p src/components/ui

echo "✅ Creating Landing page (light theme)..."
cat > src/app/page.tsx <<'EOF'
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
EOF

echo "✅ Creating app layout (dark theme)..."
cat > src/app/app/layout.tsx <<'EOF'
import "../globals.css";
import Navbar from "@/components/ui/Navbar";
import LayoutGradient from "@/components/ui/LayoutGradient";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body data-theme="dark" className="bg-gradient-to-b from-[#0d0b20] to-[#070616] text-white min-h-screen">
        <LayoutGradient />
        <Navbar />
        <main className="pt-24 px-6">{children}</main>
      </body>
    </html>
  );
}
EOF

echo "✅ Updating global styles..."
cat > src/app/globals.css <<'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ===== THEMES ===== */
:root[data-theme='light'] {
  --bg: #faf8fc;
  --text: #1a1a1a;
  --accent: #d946ef;
}

:root[data-theme='dark'] {
  --bg: #0d0b20;
  --text: #e2e8f0;
  --accent: #a855f7;
}

/* Base */
body {
  @apply antialiased transition-colors duration-500;
  background: var(--bg);
  color: var(--text);
}

/* Gradient section backgrounds */
.section-gradient {
  @apply bg-gradient-to-br from-purple-700/10 to-fuchsia-700/10 rounded-2xl p-6 shadow-lg backdrop-blur-md;
}

/* Titles */
h1, h2, h3 {
  @apply font-bold tracking-tight;
}

.btn-primary {
  @apply bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-xl shadow-lg hover:opacity-90 transition;
}
EOF

echo "✅ Moving internal pages under /app/app..."
find src/app -mindepth 1 -maxdepth 1 -type d ! -name "app" ! -name "api" -exec mv {} src/app/app/ \; 2>/dev/null || true

echo "✅ Cleaning Next.js cache..."
rm -rf .next

echo "✅ Build check..."
npm run build

echo "🎉 Setup complete! 
Landing page:    /
Main app pages:  /app/menu, /app/game, etc.
"

