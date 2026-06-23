/* Service worker AUTO-DESTRUCTEUR.
   Une ancienne version PWA avait enregistre un SW qui cache l'app et empeche les MAJ.
   Ce SW prend la main, vide TOUS les caches, se desinscrit, et force le rechargement
   des onglets ouverts pour qu'ils repartent sur la version reseau a jour. */
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    try {
      await self.registration.unregister();
    } catch (e) {}
    /* Pas de rechargement force : on ne veut pas recharger un onglet en pleine partie.
       La version fraiche arrive au prochain refresh naturel de l'utilisateur. */
  })());
});
/* Ne cache plus rien : tout passe par le reseau. */
self.addEventListener("fetch", () => {});
