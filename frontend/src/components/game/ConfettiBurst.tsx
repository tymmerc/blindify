"use client"

/* Pluie de confettis CSS pour les ecrans de fin de partie.
   Palette analog, positions/durees deterministes (pas de Math.random :
   rendu stable entre SSR et client). */
const CONFETTI_COLORS = ["#c65133", "#e0a32e", "#7d9471", "#5b6da8"]

export function ConfettiBurst() {
  const pieces = Array.from({ length: 42 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: ((i * 13) % 20) / 10,
    duration: 2.6 + ((i * 7) % 14) / 10,
    size: 7 + ((i * 5) % 7),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    tilt: (i * 53) % 360,
  }))
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`@keyframes confetti-fall { from { transform: translateY(-8vh) rotate(0deg); opacity: 1; } to { transform: translateY(105vh) rotate(720deg); opacity: 0.7; } }`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            background: p.color,
            transform: `rotate(${p.tilt}deg)`,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}
