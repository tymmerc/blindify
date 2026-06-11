"use client"

import Link from "next/link"
import { ArrowLeft, PlugZap } from "lucide-react"

export default function ProviderSettingsPlaceholder() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 text-center text-[#2e2014]">
      <div className="rounded-md border-2 border-[#2e2014] bg-[#ece1c8] px-10 py-12 shadow-[4px_4px_0_rgba(46,32,20,.18)]">
        <PlugZap className="mx-auto h-12 w-12 text-[#c65133]" />
        <h1 className="mt-6 font-display text-3xl font-semibold text-[#2e2014]">Provider management is on its way</h1>
        <p className="mt-4 text-sm text-[#6b573f]">
          We&apos;re building a dedicated control panel to link Spotify, Deezer, Apple Music, and local uploads. You&apos;ll be
          able to refresh connections, review scopes, and configure fallbacks from here very soon.
        </p>
      </div>
      <Link
        href="/modes"
        className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
      >
        <ArrowLeft className="h-4 w-4" />
        Return to menu
      </Link>
    </main>
  )
}
