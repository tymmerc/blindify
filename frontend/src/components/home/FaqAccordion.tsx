// Accordeon de questions/reponses, partage par la landing, /faq/ et les guides.
//
// Volontairement en <details>/<summary> natif : aucun JavaScript, donc ca marche
// dans l'export statique et, surtout, le texte des reponses reste dans le HTML
// pre-rendu meme replie. C'est ce que lisent Google, Bing et les IA, et c'est ce
// qui autorise le JSON-LD FAQPage a pointer dessus.
//
// Pensee pour les fonds clairs (creme et papier) : c'est le seul contexte ou
// elle est utilisee aujourd'hui. Sur fond encre il faudrait un jeu de couleurs
// clair, pas encore ecrit.

type Item = { q: string; a: string }

export function FaqAccordion({
  items,
  defaultOpen = 0,
}: {
  items: ReadonlyArray<Item>
  /** Index de la question ouverte au chargement, -1 pour tout replier. */
  defaultOpen?: number
}) {
  return (
    <div className="divide-y-2 divide-[rgba(46,32,20,.2)] border-y-2 border-[rgba(46,32,20,.2)]">
      {items.map((item, i) => (
        <details key={item.q} open={i === defaultOpen} className="group">
          <summary
            className="flex cursor-pointer list-none items-start justify-between gap-5 py-5 font-display text-xl font-semibold text-[#cc4830] transition hover:text-[#2e2014] [&::-webkit-details-marker]:hidden"
          >
            {item.q}
            {/* Le carre garde la meme taille ouvert ou ferme : la fleche pivote,
                la ligne de question ne bouge pas. */}
            <span
              aria-hidden
              className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md border-2 border-[#2e2014] text-[#2e2014] transition-transform duration-200 group-open:rotate-180"
            >
              <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden>
                <path d="M1 1.5 6 6.5 11 1.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
              </svg>
            </span>
          </summary>
          {/* pr- seulement a partir de sm : sur un telephone etroit, reserver la
              largeur du chevron couperait le texte trop tot. */}
          <p className="pb-6 text-[1.05rem] leading-relaxed text-[#2e2014] sm:pr-12">{item.a}</p>
        </details>
      ))}
    </div>
  )
}
