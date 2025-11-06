"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function UploadPlaceholderPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 text-center">
      <div className="space-y-4">
        <p className="text-xs uppercase tracking-[0.5em] text-slate-400">Local uploads</p>
        <h1 className="text-4xl font-semibold text-white">Coming soon</h1>
        <p className="text-sm text-slate-300">
          You&apos;ll soon be able to upload your own MP3 snippets and craft custom rounds. The feature is currently in
          development—stay tuned!
        </p>
      </div>
      <div className="flex justify-center">
        <Button asChild variant="outline" className="gap-2">
          <Link href="/menu">
            <ArrowLeft className="h-4 w-4" />
            Return to menu
          </Link>
        </Button>
      </div>
    </main>
  )
}
