/**
 * Lance `run` seulement si rien ne tourne deja sous ce drapeau. Sert a
 * « Rejouer » et « Revanche » : un double clic ne lance pas deux parties (le
 * serveur refuse aussi, mais l'ecran ne doit pas afficher d'erreur pour ca).
 */
export async function runExclusive<R>(flag: { current: boolean }, run: () => Promise<R>): Promise<R | undefined> {
  if (flag.current) return undefined
  flag.current = true
  try {
    return await run()
  } finally {
    flag.current = false
  }
}
