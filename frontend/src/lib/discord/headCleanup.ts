/**
 * Le proxy de Discord reecrit notre HTML (releve le 14/10/2026 sur
 * <id>.discordsays.com) : il pose un nonce sur nos scripts inline et insere en
 * tete du <head> un <script type="text/javascript"> a lui (RTCPeerConnection et
 * WebTransport a null, service workers bloques). React ne connait pas ce
 * script : l'hydratation echoue (erreur 418, « server rendered HTML didn't
 * match ») et tout l'arbre est regenere.
 *
 * Ce bout de script, place en tete du script inline du layout, le retire avant
 * l'hydratation, avec les retours a la ligne qui l'entourent (Next n'en met
 * aucun entre les balises du <head> : un noeud texte suffit a casser la 418). Il a deja tourne, ses effets restent. Blindz ne rend jamais de
 * script de ce type : seuls ceux de Next (src ou sans type) et le JSON-LD.
 * Sous discordsays.com seulement : ailleurs, rien ne change.
 */
export const DISCORD_HEAD_CLEANUP = `if (/\\.discordsays\\.com$/.test(location.hostname) && document.head) {
  var injected = document.head.querySelectorAll('script[type="text/javascript"]:not([src])');
  for (var i = 0; i < injected.length; i++) injected[i].parentNode.removeChild(injected[i]);
  var nodes = document.head.childNodes;
  for (var j = nodes.length - 1; j >= 0; j--) {
    if (nodes[j].nodeType === 3 && !/\\S/.test(nodes[j].nodeValue)) document.head.removeChild(nodes[j]);
  }
}`
