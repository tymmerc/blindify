"use client"

import Link from "next/link"
import { ArrowLeft, PlugZap } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ProviderSettingsPlaceholder() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="surface rounded-3xl border border-white/10 px-10 py-12">
        <PlugZap className="mx-auto h-12 w-12 text-neon" />
        <h1 className="mt-6 text-3xl font-semibold text-white">Provider management is on its way</h1>
        <p className="mt-4 text-sm text-slate-300">
          We&apos;re building a dedicated control panel to link Spotify, Deezer, Apple Music, and local uploads. You&apos;ll be
          able to refresh connections, review scopes, and configure fallbacks from here very soon.
        </p>
      </div>
      <Button asChild variant="outline" className="gap-2">
        <Link href="/menu">
          <ArrowLeft className="h-4 w-4" />
          Return to menu
        </Link>
      </Button>
    </main>
  )
}
