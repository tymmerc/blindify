"use client"

// Ecrans d'attente et d'erreur du solo, entre le lobby et la partie. Avant :
// texte anglais en gris clair sur fond creme ("Initialising game"), quasi
// invisible, reste de l'ancien theme sombre.

const GROOVES = "repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)"

export function SoloLoading() {
  return (
    <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center text-[#2e2014]">
      <div
        aria-hidden
        className="relative h-16 w-16 rounded-full border-2 border-[#2e2014]"
        style={{ background: GROOVES, animation: "vinyl-spin 2s linear infinite" }}
      >
        <span className="absolute inset-[33%] rounded-full border-2 border-[#2e2014] bg-[#c65133]" />
        <span className="absolute inset-[45%] rounded-full bg-[#f4ecdb]" />
      </div>
      <p className="font-display text-lg font-semibold">On prépare tes morceaux...</p>
      <p className="text-sm text-[#6b573f]">Ça prend quelques secondes, le temps de trouver les extraits.</p>
    </div>
  )
}

export function SoloProblem({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-[#2e2014]">
      <div role="alert" className="w-full max-w-md space-y-5 rounded-md border-2 border-[#2e2014] bg-[#ece1c8] p-6 text-center shadow-[4px_4px_0_rgba(46,32,20,.18)] sm:p-8">
        <h1 className="font-display text-2xl font-semibold">La partie n&apos;a pas pu démarrer</h1>
        <p className="text-sm leading-relaxed text-[#6b573f]">{message}</p>
        <button
          type="button"
          onClick={onBack}
          className="btn-neon w-full justify-center text-sm"
        >
          Changer de lien
        </button>
      </div>
    </div>
  )
}
