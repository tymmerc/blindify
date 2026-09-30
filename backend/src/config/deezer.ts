/**
 * Adresse de l'API Deezer. Surchargeable UNIQUEMENT pour la pile de test
 * (tools/test-stack) : elle pointe alors sur un faux Deezer local, pour ne
 * jamais appeler le vrai a l'echelle d'une campagne (Akamai bloque l'IP du VPS,
 * et ce blocage touche les vrais joueurs). Sans la variable : le vrai Deezer.
 */
export const DEEZER_API = (process.env.DEEZER_API_BASE || "https://api.deezer.com").replace(/\/+$/, "");
