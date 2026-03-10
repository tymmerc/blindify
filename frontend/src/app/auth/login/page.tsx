"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { Logo } from "@/components/Logo"

const providers = [
  {
    id: "spotify",
    label: "Continuer avec Spotify",
    desc: "Accès likes, playlists et top artistes instantanément.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
      </svg>
    ),
    color: "from-[#1DB954]/20 to-[#1DB954]/5",
    hoverColor: "group-hover:shadow-[0_20px_60px_rgba(29,185,84,0.25)]",
    tags: ["Spotify Connect", "OAuth 2.0"],
  },
  {
    id: "apple-music",
    label: "Continuer avec Apple Music",
    desc: "Synchronise ta bibliothèque et tes playlists Apple.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.042-1.785-.404-2.17-1.256a1.858 1.858 0 01-.145-.623 1.996 1.996 0 011.39-2.1c.376-.13.77-.2 1.16-.267.376-.066.754-.115 1.13-.18.287-.05.507-.2.612-.49a.965.965 0 00.058-.346c.005-1.807.004-3.616.003-5.424v-.17c-.008-.062-.017-.148-.027-.233-.038-.017-.078-.008-.116 0-.33.066-.66.13-.99.2-1.09.216-2.18.434-3.27.65-.597.12-1.196.236-1.793.36-.088.017-.168.06-.186.16a.623.623 0 00-.016.143v7.318c0 .5-.063.993-.282 1.45-.32.664-.835 1.087-1.556 1.262-.342.083-.693.123-1.043.133-.915.025-1.713-.327-2.192-1.17a2.028 2.028 0 01-.233-.735 2.13 2.13 0 01.172-1.152c.273-.55.713-.916 1.29-1.105.377-.123.767-.19 1.156-.263.39-.074.78-.138 1.168-.22.34-.072.545-.27.6-.625a.958.958 0 00.015-.195v-7.292c0-.252.038-.5.13-.738.144-.37.404-.612.777-.727.203-.063.414-.1.625-.13l2.092-.405c1.31-.252 2.618-.504 3.927-.758.39-.075.782-.153 1.175-.223.168-.03.34-.037.51-.02.397.04.7.258.852.63.078.19.104.393.104.6.002 1.96.002 3.92 0 5.88z"/>
      </svg>
    ),
    color: "from-[#FA243C]/20 to-[#FA243C]/5",
    hoverColor: "group-hover:shadow-[0_20px_60px_rgba(250,36,60,0.25)]",
    tags: ["MusicKit", "Apple ID"],
  },
  {
    id: "deezer",
    label: "Continuer avec Deezer",
    desc: "Importe tes favoris et Flow personnalisé.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M18.81 4.16v3.03H24V4.16h-5.19zM6.27 8.38v3.027h5.189V8.38h-5.19zm12.54 0v3.027H24V8.38h-5.19zM6.27 12.594v3.027h5.189v-3.027h-5.19zm6.27 0v3.027h5.19v-3.027h-5.19zm6.27 0v3.027H24v-3.027h-5.19zM0 16.81v3.029h5.19v-3.03H0zm6.27 0v3.029h5.189v-3.03h-5.19zm6.27 0v3.029h5.19v-3.03h-5.19zm6.27 0v3.029H24v-3.03h-5.19z"/>
      </svg>
    ),
    color: "from-[#A238FF]/20 to-[#A238FF]/5",
    hoverColor: "group-hover:shadow-[0_20px_60px_rgba(162,56,255,0.25)]",
    tags: ["Deezer Connect", "OAuth 2.0"],
  },
  {
    id: "youtube-music",
    label: "Continuer avec YouTube Music",
    desc: "Accède à tes playlists et recommandations YouTube.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/>
      </svg>
    ),
    color: "from-[#FF0000]/20 to-[#FF0000]/5",
    hoverColor: "group-hover:shadow-[0_20px_60px_rgba(255,0,0,0.25)]",
    tags: ["Google OAuth", "YouTube API"],
  },
  {
    id: "tidal",
    label: "Continuer avec Tidal",
    desc: "Audio HiFi et playlists exclusives.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996l4.004 4.004L0 16.004 4.004 20l4.004-4.004 4.004 4.004 4.004-4.004-4.004-4.004 4.004-4.004-4.004-4.004 4.004-4.004L12.012 0 8.008 3.992l4.004 4zm3.996 4.004l4.004-4.004L24.016 8l-4.004 4.004L24.016 16l-4.004 4.004-4.004-4.004L12.004 20l4.004-4.004-4.004-4.004L16.008 8z"/>
      </svg>
    ),
    color: "from-[#00FFFF]/20 to-[#00FFFF]/5",
    hoverColor: "group-hover:shadow-[0_20px_60px_rgba(0,255,255,0.25)]",
    tags: ["Tidal Connect", "OAuth 2.0"],
  },
  {
    id: "amazon-music",
    label: "Continuer avec Amazon Music",
    desc: "Intègre ta bibliothèque Amazon et Alexa.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M13.958 10.09c0 1.232.029 2.256-.591 3.351-.502.891-1.301 1.438-2.186 1.438-1.214 0-1.922-.924-1.922-2.292 0-2.692 2.415-3.182 4.7-3.182v.685zm3.186 7.705a.66.66 0 01-.753.076c-1.057-.878-1.247-1.287-1.826-2.123-1.746 1.778-2.982 2.31-5.246 2.31-2.68 0-4.764-1.654-4.764-4.962 0-2.583 1.401-4.339 3.392-5.2 1.726-.753 4.135-.887 5.979-1.095v-.41c0-.753.058-1.64-.383-2.29-.385-.578-1.124-.82-1.775-.82-1.205 0-2.277.618-2.54 1.9-.054.285-.261.566-.549.58l-3.063-.33c-.259-.058-.548-.266-.475-.66C6.87 1.68 9.994.381 12.834.381c1.452 0 3.349.385 4.494 1.48 1.452 1.36 1.315 3.173 1.315 5.146v4.665c0 1.402.581 2.018 1.128 2.775.191.265.233.585-.009.782-.605.506-1.682 1.446-2.275 1.974l-.343-.41zm2.754 3.518c-1.56 1.153-3.826 1.687-5.768 1.687-2.73 0-5.188-.85-7.044-2.267-.146-.113-.016-.267.158-.179 2.005 1.217 4.485 1.951 7.044 1.951 1.726 0 3.626-.377 5.374-1.156.264-.117.486.168.236.364zm.68-.776c-.2-.256-1.32-.121-1.823-.062-.153.018-.177-.114-.039-.21.892-.627 2.357-.446 2.528-.236.172.212-.045 1.684-.882 2.386-.129.108-.251.051-.194-.093.189-.468.61-1.529.41-1.785z"/>
      </svg>
    ),
    color: "from-[#00A8E1]/20 to-[#00A8E1]/5",
    hoverColor: "group-hover:shadow-[0_20px_60px_rgba(0,168,225,0.25)]",
    tags: ["Amazon Login", "Music API"],
  },
  {
    id: "soundcloud",
    label: "Continuer avec SoundCloud",
    desc: "Découvre artistes indépendants et remixes.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.052-.1-.1-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.165 1.308c.014.057.045.094.09.094s.089-.037.099-.094l.19-1.308-.19-1.334c-.01-.057-.054-.09-.09-.09m1.83-1.229c-.06 0-.12.037-.12.1l-.21 2.563.225 2.458c0 .06.045.103.105.103.074 0 .12-.043.12-.103l.24-2.458-.24-2.563c0-.06-.03-.1-.12-.1m.945-.089c-.075 0-.135.06-.15.135l-.193 2.64.21 2.544c.016.077.075.138.149.138.075 0 .135-.061.15-.138l.24-2.544-.24-2.64c-.015-.135-.074-.135-.165-.135m1.155.36c-.005-.09-.075-.149-.159-.149-.09 0-.158.06-.164.149l-.217 2.43.2 2.563c0 .09.06.15.149.15.09 0 .164-.06.164-.15l.227-2.563-.227-2.43m.809-1.709c-.101 0-.18.09-.18.181l-.21 3.957.187 2.563c0 .09.08.164.18.164.094 0 .174-.09.18-.18l.209-2.563-.209-3.972c-.008-.104-.088-.18-.18-.18m.959-.914c-.105 0-.195.09-.203.194l-.18 4.872.165 2.548c0 .12.09.209.195.209.104 0 .194-.089.21-.209l.193-2.548-.192-4.856c-.016-.12-.105-.21-.21-.21m.989-.449c-.121 0-.211.089-.225.209l-.165 5.275.165 2.52c.014.119.104.225.225.225.119 0 .225-.105.225-.225l.195-2.52-.196-5.275c0-.12-.105-.209-.225-.209m1.245.045c0-.135-.105-.24-.24-.24-.119 0-.24.105-.24.24l-.149 5.441.149 2.503c.016.135.121.24.256.24s.24-.105.24-.24l.164-2.503-.164-5.456-.016.015zm.749-.134c-.135 0-.255.119-.255.254l-.15 5.322.15 2.473c0 .15.12.255.255.255s.255-.12.255-.27l.15-2.458-.15-5.307c0-.148-.12-.27-.255-.27m1.005.166c-.164 0-.284.135-.284.285l-.103 5.143.135 2.474c0 .149.119.277.284.277.149 0 .271-.12.284-.285l.121-2.443-.135-5.158c-.014-.164-.12-.285-.285-.285m1.184-.949c-.015-.18-.15-.314-.33-.314-.165 0-.315.135-.315.314l-.135 6.078.135 2.442c0 .181.15.315.315.315.165 0 .315-.135.315-.315l.149-2.442-.149-6.093.015.015zm.704-.239c-.165 0-.33.149-.33.329l-.12 6.332.12 2.389c0 .18.165.329.33.329.181 0 .33-.149.345-.329l.135-2.389-.135-6.332c-.015-.165-.165-.329-.345-.329m1.125.269c0-.195-.165-.345-.36-.345-.181 0-.345.165-.345.345l-.12 6.409.12 2.354c0 .195.164.36.345.36.195 0 .36-.165.36-.36l.12-2.354-.12-6.41zm.704-.599c-.193 0-.375.18-.375.374l-.12 6.635.12 2.339c0 .195.18.375.375.375.18 0 .375-.18.375-.375l.105-2.34-.105-6.634c0-.195-.195-.375-.375-.375m1.095-.374c0-.21-.195-.39-.406-.39-.195 0-.39.18-.39.39l-.12 7.008.12 2.295c0 .21.195.39.39.39.21 0 .405-.18.405-.39l.12-2.295-.12-7.007v-.001zm.649.016c-.21 0-.405.194-.405.419l-.105 6.59.105 2.28c0 .224.195.42.405.42.225 0 .42-.195.42-.42l.105-2.28-.105-6.59c0-.225-.195-.42-.42-.42m1.17-.449c-.225 0-.42.21-.435.435l-.105 7.039.105 2.221c.015.225.21.436.435.436.225 0 .42-.211.42-.436l.12-2.221-.12-7.039c0-.225-.21-.435-.42-.435m.705-.885c-.24 0-.45.209-.45.449l-.09 7.914.09 2.176c0 .255.21.464.45.464.255 0 .45-.209.45-.464l.105-2.176-.105-7.914c0-.24-.21-.449-.45-.449m1.125.449c-.255 0-.464.21-.464.465l-.06 7.456.075 2.13c0 .255.209.48.449.48.255 0 .479-.225.479-.48l.075-2.13-.075-7.456c0-.255-.225-.465-.48-.465m.704-.509c-.27 0-.494.226-.494.48l-.06 7.965.06 2.07c0 .27.225.494.495.494.254 0 .494-.225.494-.495l.09-2.069-.09-7.98c0-.254-.24-.479-.495-.479m3.09 3.719c-.449-.39-.96-.599-1.52-.599-.255 0-.494.045-.72.12-.181-2.19-2.025-3.899-4.275-3.899-.494 0-.975.09-1.425.255-.18.075-.225.15-.24.3v10.051c.015.165.135.3.3.314h7.275c1.32 0 2.414-1.109 2.414-2.444s-1.08-2.459-2.4-2.459"/>
      </svg>
    ),
    color: "from-[#FF5500]/20 to-[#FF5500]/5",
    hoverColor: "group-hover:shadow-[0_20px_60px_rgba(255,85,0,0.25)]",
    tags: ["SoundCloud", "OAuth 2.0"],
  },
]

const highlights = [
  { title: "Modes amis, événement & stream", copy: "Tu choisis le format, Blindify garde le rythme." },
  { title: "Audio privé", copy: "Lecture côté client, tokens stockés de façon chiffrée." },
]

export default function AuthLoginPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    async function verify() {
      try {
        const me = await api.checkAuth()
        if (!active) return
        if (me) {
          router.replace("/friends")
          return
        }
      } finally {
        if (active) setChecking(false)
      }
    }
    verify()
    return () => {
      active = false
    }
  }, [router])

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--ma-bg)]">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/50 px-4 py-2 text-[10px] uppercase tracking-[0.32em] text-white/70">
          <span className="h-2 w-2 animate-pulse rounded-full bg-gradient-to-r from-primary to-accent" aria-hidden />
          Vérification de session...
        </div>
      </div>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--ma-bg)] text-white">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(168,85,247,0.18),transparent_38%),radial-gradient(circle_at_82%_12%,rgba(34,197,94,0.12),transparent_32%),radial-gradient(circle_at_50%_88%,rgba(236,72,153,0.16),transparent_40%)]" />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 40%, rgba(255,255,255,0.04) 75%)" }} />
        <div className="absolute left-1/2 top-20 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.06),transparent_60%)] blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 lg:px-8">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Logo withText priority className="w-fit" />
          <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Connexion sécurisée</span>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-10 pb-10 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="space-y-6">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
                Ta session commence{" "}
                <span className="bg-gradient-to-r from-primary via-accent to-amber-300 bg-clip-text text-transparent">
                  avec le nouveau flow.
                </span>
              </h1>
              <p className="max-w-xl text-sm text-[var(--ma-muted)]">
                On a repensé la page de connexion : un sas clair, rapide, qui te pose directement dans l&apos;expérience Blindify.
                Connecte-toi avec ta plateforme préférée, le jeu garde ton rythme.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {highlights.map(item => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-2 text-xs text-white/70">{item.copy}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="relative">
            <div className="absolute inset-0 -left-6 -right-6 -top-6 -bottom-6 -z-10 rounded-[30px] bg-gradient-to-b from-white/10 via-transparent to-white/20 blur-3xl" aria-hidden />
            <div className="rounded-[26px] border border-white/10 bg-black/50 p-8 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="mb-8 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">Connexion Blindify</p>
                  <h2 className="text-2xl font-semibold leading-tight">Choisis ton point de départ</h2>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.35em] text-white/60">Étape 1</span>
              </div>

              <div className="max-h-[340px] space-y-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-white/5 scrollbar-thumb-white/20">
                {providers.map(provider => (
                  <a
                    key={provider.id}
                    href={api.getProviderLoginUrl(provider.id)}
                    className={`group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r ${provider.color} px-5 py-4 transition duration-200 hover:border-white/20 ${provider.hoverColor}`}
                  >
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white">
                      {provider.icon}
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{provider.label}</p>
                      <p className="text-xs text-white/70 truncate">{provider.desc}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.2em] text-white/60">
                        {provider.tags.map((tag, i) => (
                          <span key={tag} className={`rounded-full px-2.5 py-1 ${i === 0 ? "border border-white/20 bg-white/5" : "border border-white/10"}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="relative text-lg text-white/70 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-white">→</span>
                  </a>
                ))}
              </div>

              <div className="my-7 flex items-center gap-3 text-[10px] uppercase tracking-[0.5em] text-white/60">
                <span className="h-px flex-1 bg-white/10" />
                ou sans compte
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <button
                onClick={() => router.push("/solo")}
                className="relative w-full overflow-hidden rounded-full border border-white/10 bg-gradient-to-r from-primary via-amber-300 to-accent px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-black shadow-[0_16px_50px_rgba(168,85,247,0.3)] transition duration-200 hover:shadow-[0_18px_56px_rgba(168,85,247,0.4)]"
              >
                <span className="relative">Jouer en solo</span>
              </button>

              <div className="mt-6 flex flex-col gap-2 text-center text-xs text-white/70">
                <p>
                  Besoin d&apos;aide ?{" "}
                  <button type="button" className="text-white underline-offset-4 hover:underline" onClick={() => router.push("/")}>
                    Retour à l&apos;accueil
                  </button>
                </p>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">Accès rapide. Auth sécurisée.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
