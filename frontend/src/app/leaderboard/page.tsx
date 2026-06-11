"use client"

import Link from "next/link"

export default function LeaderboardPage() {
  return (
    <div className="grid min-h-screen place-items-center text-[#2e2014]">
      <div className="flex flex-col items-center text-center space-y-4 px-6">
        <span
          aria-hidden
          className="relative block h-20 w-20 rounded-full border-[3px] border-[#2e2014]"
          style={{
            background:
              "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)",
            animation: "vinyl-spin 7s linear infinite",
          }}
        >
          <span className="absolute inset-[33%] rounded-full border-2 border-[#2e2014] bg-[#e0a32e]" />
          <span className="absolute inset-[46%] rounded-full bg-[#f4ecdb]" />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#c65133]">
          Face B · Classement
        </p>
        <h1 className="font-display text-3xl font-semibold">Classement</h1>
        <p className="text-sm text-[#6b573f] max-w-md">
          Les classements seront disponibles prochainement. Joue des parties pour accumuler des points !
        </p>
        <Link
          href="/modes"
          className="inline-block rounded-full border-[1.5px] border-[#2e2014] bg-[#ece1c8] px-6 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#2e2014] transition hover:bg-[#2e2014] hover:text-[#f4ecdb]"
        >
          Retour
        </Link>
      </div>
    </div>
  )
}
