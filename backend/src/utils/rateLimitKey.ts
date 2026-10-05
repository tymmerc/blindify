/**
 * Cle de limitation de debit pour une adresse IP.
 *
 * Une IPv4 compte pour elle-meme. Une IPv6 est regroupee par /64 : un
 * fournisseur d'acces confie au moins un /64 a chaque abonne, qui peut changer
 * d'adresse a volonte dans ce bloc. Compter adresse par adresse lui donnerait
 * autant de compteurs neufs qu'il veut. express-rate-limit 7 ne regroupe pas
 * (la version 8 le fait, voir la PR Dependabot #16).
 *
 * ipaddr.js est celui d'express (via proxy-addr), deja present dans
 * package-lock.json : aucune dependance en plus.
 */
import ipaddr from "ipaddr.js";

// 4 groupes de 16 bits = les 64 premiers bits de l'adresse.
const IPV6_PREFIX_GROUPS = 4;

export function ipRateLimitKey(ip: string | undefined): string {
  if (!ip) return "inconnue";
  let address: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    // process() ramene aussi ::ffff:a.b.c.d a l'IPv4 a.b.c.d.
    address = ipaddr.process(ip);
  } catch {
    // Forme que ipaddr.js ne lit pas : on compte l'adresse telle quelle.
    return ip;
  }
  if (address.kind() === "ipv4") return address.toString();
  const prefix = (address as ipaddr.IPv6).parts
    .slice(0, IPV6_PREFIX_GROUPS)
    .map(group => group.toString(16))
    .join(":");
  return `${prefix}::/64`;
}
