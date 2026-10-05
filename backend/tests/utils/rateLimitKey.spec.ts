// Cle de limitation de debit : une IPv4 compte pour elle-meme, une IPv6 est
// regroupee par /64 (le bloc qu'un abonne recoit et dans lequel il peut
// changer d'adresse a volonte).
import { ipRateLimitKey } from "../../src/utils/rateLimitKey";

describe("ipRateLimitKey", () => {
  it("garde une IPv4 telle quelle", () => {
    expect(ipRateLimitKey("203.0.113.7")).toBe("203.0.113.7");
  });

  it("ramene une IPv4 vue en IPv6 (::ffff:a.b.c.d) a l'IPv4", () => {
    expect(ipRateLimitKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("regroupe deux IPv6 du meme /64, quelle que soit leur ecriture", () => {
    const a = ipRateLimitKey("2001:db8:abcd:12:1:2:3:4");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(ipRateLimitKey("2001:DB8:ABCD:0012::9")).toBe(a);
    expect(ipRateLimitKey("2001:db8:abcd:12:ffff:ffff:ffff:ffff")).toBe(a);
  });

  it("separe deux /64 voisins", () => {
    expect(ipRateLimitKey("2001:db8:abcd:13::1")).not.toBe(ipRateLimitKey("2001:db8:abcd:12::1"));
  });

  it("ignore l'indice de zone d'une adresse de lien local", () => {
    expect(ipRateLimitKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });

  it("compte une forme inattendue telle quelle, et une adresse absente sous une cle commune", () => {
    expect(ipRateLimitKey("pas-une-ip")).toBe("pas-une-ip");
    expect(ipRateLimitKey(undefined)).toBe("inconnue");
    expect(ipRateLimitKey("")).toBe("inconnue");
  });
});
