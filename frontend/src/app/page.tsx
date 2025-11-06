"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import {
  ArrowRight,
  BarChart3,
  Headphones,
  Play,
  Radio,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react"

const features = [
  {
    title: "Solo Mode",
    description: "Train your ear with adaptive rounds sourced from your real playlists and uploads.",
    icon: Headphones,
  },
  {
    title: "Multiplayer Rooms",
    description: "Host neon-lit battles with instant sync, countdown cues, and score streaks.",
    icon: Users,
  },
  {
    title: "Cross-Platform",
    description: "Spotify, Deezer, Apple Music, and local files — mix every library into one arena.",
    icon: Radio,
  },
  {
    title: "Personal Stats",
    description: "Track accuracy, reaction time, XP, and streaks with a cyberpunk-inspired dashboard.",
    icon: BarChart3,
  },
  {
    title: "Live Leaderboard",
    description: "Climb the city-wide ladder and see friends rise in real time.",
    icon: Sparkles,
  },
  {
    title: "Local Uploads",
    description: "Drop your own MP3 snippets for secret rounds only you can unveil.",
    icon: UploadCloud,
  },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0">
        <motion.div
          className="pointer-events-none absolute inset-0 opacity-50"
          animate={{ backgroundPosition: ["0% 0%", "200% 200%"] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(168,85,247,0.25), transparent 55%), radial-gradient(circle at 80% 15%, rgba(34,197,94,0.25), transparent 50%), radial-gradient(circle at 50% 120%, rgba(59,130,246,0.12), transparent 65%)",
          }}
        />
      </div>

      <main className="relative z-10 flex min-h-screen flex-col">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-8">
          <div className="flex items-center gap-3">
            <div className="surface flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10">
              <motion.span
                className="text-xl font-semibold text-neon"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2.8, repeat: Infinity }}
              >
                ♫
              </motion.span>
            </div>
            <span className="text-lg font-semibold uppercase tracking-[0.4em] text-slate-300">
              Blindify
            </span>
          </div>

          <div className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <Link href="#modes" className="transition hover:text-white">
              Modes
            </Link>
            <Link href="#features" className="transition hover:text-white">
              Features
            </Link>
            <Link href="#community" className="transition hover:text-white">
              Community
            </Link>
            <Link
              href="/auth/login"
              className="btn-primary hover:shadow-[0_0_24px_rgba(168,85,247,0.45)]"
            >
              Start for free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </nav>

        <section className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col items-center gap-16 px-6 pb-24 pt-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex flex-col items-center gap-10 text-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs font-medium uppercase tracking-[0.45em] text-slate-300">
              <Sparkles className="h-4 w-4 text-neon" />
              Universal music game
            </span>
            <div className="max-w-3xl space-y-6">
              <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
                Blindify — <span className="text-neon">Play your music differently.</span>
              </h1>
              <p className="mx-auto max-w-2xl text-lg text-slate-300 md:text-xl">
                Connect your Spotify, Deezer, Apple Music, or local files. Blindify pulls your songs,
                crafts cinematic rounds, and synchronises every reveal in neon-lit multiplayer arenas.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link href="/auth/login" className="btn-primary">
                  <Play className="h-4 w-4" />
                  Start for free
                </Link>
                <Link
                  href="#concept"
                  className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white"
                >
                  Watch concept
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </motion.div>

          <motion.div
            id="concept"
            initial={{ opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true, amount: 0.35 }}
            className="glow-border relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-[1px] backdrop-blur-3xl"
          >
            <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-black/40 px-10 py-14 backdrop-blur-xl">
              <motion.div
                className="absolute inset-0 bg-[radial-gradient(circle_at_30%_-10%,rgba(168,85,247,0.45),transparent_55%),radial-gradient(circle_at_80%_20%,rgba(34,197,94,0.35),transparent_60%)] opacity-70"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 6, repeat: Infinity }}
              />
              <div className="relative z-10 flex flex-col gap-6">
                <p className="text-sm uppercase tracking-[0.6em] text-slate-300">
                  Immersive visualiser
                </p>
                <p className="max-w-xl text-lg text-slate-200">
                  Waves pulse with every beat, colours bloom on correct guesses, and the crowd erupts
                  when you streak. Blindify&apos;s UI blends glassmorphism, neon gradients, and subtle
                  particle animations for peak focus.
                </p>
              </div>
              <motion.div
                className="floating absolute -bottom-16 right-10 hidden h-40 w-40 rounded-full bg-gradient-to-br from-purple-500/40 to-emerald-500/40 blur-3xl md:block"
                animate={{ y: [0, -12, 0], opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 8, repeat: Infinity }}
              />
            </div>
          </motion.div>
        </section>

        <section id="features" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, amount: 0.3 }}
            className="mb-12 flex flex-col items-center gap-4 text-center"
          >
            <span className="text-sm uppercase tracking-[0.5em] text-slate-400">Feature highlights</span>
            <h2 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
              Everything you need to run the ultimate blind test
            </h2>
            <p className="max-w-2xl text-slate-300">
              Seamless provider switching, polished transitions, and enough analytics to fuel your next rivalry.
            </p>
          </motion.div>
          <div className="grid gap-8 md:grid-cols-2">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                viewport={{ once: true, amount: 0.25 }}
                className="surface group relative overflow-hidden rounded-3xl p-6 transition duration-300 hover:bg-white/10"
              >
                <div className="flex items-start gap-4">
                  <div className="pulse-glow flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <feature.icon className="h-6 w-6 text-neon" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                    <p className="text-sm text-slate-300">{feature.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="modes" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true, amount: 0.3 }}
            className="surface-strong relative overflow-hidden rounded-3xl border border-white/10 p-10"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-emerald-500/10" />
            <div className="relative grid gap-10 lg:grid-cols-2">
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-white sm:text-4xl">
                  Solo, multiplayer, or local upload — switch modes in a beat.
                </h2>
                <p className="text-slate-300">
                  Blindify harmonises with each player&apos;s account. Host rooms with room codes, blast through countdowns,
                  and let everyone play audio on-device to keep latency near zero.
                </p>
                <div className="flex flex-wrap gap-3">
                  {["Adaptive difficulty", "Real-time scoring", "WebSockets sync", "XP progression"].map(label => (
                    <span
                      key={label}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.3em] text-slate-300"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <motion.div
                className="relative overflow-hidden rounded-3xl border border-white/10 bg-black/40 p-6 backdrop-blur-xl"
                animate={{ boxShadow: ["0 0 15px rgba(168,85,247,0.2)", "0 0 25px rgba(34,197,94,0.25)", "0 0 15px rgba(168,85,247,0.2)"] }}
                transition={{ duration: 6, repeat: Infinity }}
              >
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium uppercase tracking-[0.3em] text-slate-300">
                      Live round
                    </span>
                    <span className="rounded-full border border-purple-400/40 bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-200">
                      Sync 0.08s
                    </span>
                  </div>
                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-300">Round 03 — Reveal in</p>
                      <p className="mt-2 text-4xl font-bold text-white">00:12</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-slate-300">Current streak</p>
                      <p className="mt-2 text-4xl font-bold text-neon">x4</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                    <p className="text-sm text-slate-300">Leaderboard</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-200">
                      <li className="flex items-center justify-between">
                        <span>Aya</span>
                        <span className="font-semibold text-white">920 pts</span>
                      </li>
                      <li className="flex items-center justify-between text-slate-400">
                        <span>Remy</span>
                        <span className="font-medium">860 pts</span>
                      </li>
                      <li className="flex items-center justify-between text-slate-500">
                        <span>Nova</span>
                        <span className="font-medium">780 pts</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </section>

        <section
          id="community"
          className="relative mx-auto mb-24 w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-black/50 px-6 py-16 backdrop-blur-2xl md:px-12"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/15 via-transparent to-emerald-500/15" />
          <div className="relative flex flex-col gap-8 text-center md:items-center">
            <span className="text-sm uppercase tracking-[0.5em] text-slate-400">Join the wave</span>
            <h2 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
              Community nights, patch notes, and early feature drops.
            </h2>
            <p className="mx-auto max-w-2xl text-slate-300">
              We fine-tune Blindify with our community. Share track packs, suggest new providers, and unlock exclusive
              visual themes during live events.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="https://discord.gg/blindify"
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
              >
                Join Discord
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="https://airtable.com/shrBlindifyWaitlist"
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-slate-200 transition hover:border-white/30 hover:text-white"
              >
                Join the waiting list
              </Link>
            </div>
          </div>
        </section>

        <footer className="relative border-t border-white/5 bg-black/60 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-400 md:flex-row">
            <p>© {new Date().getFullYear()} Blindify. Crafted for audiophiles in the neon city.</p>
            <div className="flex items-center gap-4">
              <Link href="https://twitter.com/blindify" className="transition hover:text-white">
                Twitter
              </Link>
              <Link href="https://instagram.com/blindify" className="transition hover:text-white">
                Instagram
              </Link>
              <Link href="mailto:hello@blindify.app" className="transition hover:text-white">
                Contact
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
