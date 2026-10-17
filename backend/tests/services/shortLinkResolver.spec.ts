import { describe, it, expect, afterEach } from "@jest/globals";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  MAX_REDIRECTS,
  ShortLinkError,
  isPublicAddress,
  isShortLink,
  resolveShortLink,
  safeLookup,
  shortLinkTestBase,
  type Hop,
} from "../../src/services/shortLinkResolver";

// Redirections simulees : aucun test de ce fichier ne sort de la machine. Le
// seul serveur ouvert ecoute sur 127.0.0.1 (faux hebergeur de liens courts).

/** Un faux reseau : une reponse par adresse demandee, et le journal des appels. */
function fakeHop(routes: Record<string, { status: number; location?: string } | Error>) {
  const calls: string[] = [];
  const hop: Hop = async url => {
    calls.push(url.toString());
    const route = routes[url.toString()];
    if (!route) throw new Error(`appel inattendu : ${url}`);
    if (route instanceof Error) throw route;
    return { status: route.status, location: route.location ?? null };
  };
  return { hop, calls };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "aucune erreur";
  } catch (err) {
    return err instanceof ShortLinkError ? err.code : `autre erreur : ${String(err)}`;
  }
}

describe("isShortLink", () => {
  it.each([
    "https://link.deezer.com/s/30ZnBD9L4b4a1R5V6NWDu",
    "https://deezer.page.link/abc123",
    "https://spotify.link/aBcD3fGh1Jb",
    "https://spotify.app.link/aBcD3fGh1Jb",
    "  https://spotify.link/aBcD3fGh1Jb  ",
    "https://SPOTIFY.LINK/aBcD3fGh1Jb",
    "https://spotify.link:443/aBcD3fGh1Jb",
  ])("lien court accepte : %s", raw => {
    expect(isShortLink(raw)).toBe(true);
  });

  it.each([
    ["schema http", "http://spotify.link/aBcD3fGh1Jb"],
    ["schema ftp", "ftp://spotify.link/aBcD3fGh1Jb"],
    ["schema javascript", "javascript://spotify.link/%0aalert(1)"],
    ["schema file", "file:///etc/passwd"],
    ["port exotique", "https://spotify.link:8443/aBcD3fGh1Jb"],
    ["identifiants", "https://user:pass@spotify.link/aBcD3fGh1Jb"],
    ["sous-domaine pirate", "https://spotify.link.evil.com/x"],
    ["hote dans le chemin", "https://evil.com/spotify.link/x"],
    ["point final", "https://spotify.link./aBcD3fGh1Jb"],
    ["localhost", "https://localhost/x"],
    ["boucle IPv4", "https://127.0.0.1/x"],
    ["boucle IPv4 en decimal", "https://2130706433/x"],
    ["boucle IPv6", "https://[::1]/x"],
    ["IP privee", "https://10.0.0.1/x"],
    ["metadonnees du nuage", "https://169.254.169.254/latest/meta-data"],
    ["lien long", "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"],
    ["texte", "rien du tout"],
    ["vide", ""],
  ])("refuse (%s)", (_cas, raw) => {
    expect(isShortLink(raw)).toBe(false);
  });
});

describe("resolveShortLink", () => {
  it("Deezer : un saut, l'adresse d'arrivee n'est jamais appelee", async () => {
    const { hop, calls } = fakeHop({
      "https://link.deezer.com/s/30ZnBD9L4b4a1R5V6NWDu": { status: 302, location: "https://www.deezer.com/fr/playlist/1479458365?host=0&utm_source=share" },
    });
    await expect(resolveShortLink("https://link.deezer.com/s/30ZnBD9L4b4a1R5V6NWDu", { hop }))
      .resolves.toBe("https://www.deezer.com/fr/playlist/1479458365?host=0&utm_source=share");
    expect(calls).toEqual(["https://link.deezer.com/s/30ZnBD9L4b4a1R5V6NWDu"]);
  });

  it("Spotify : chaine entre hotes de depart, puis open.spotify.com", async () => {
    const { hop, calls } = fakeHop({
      "https://spotify.link/aBcD3fGh1Jb": { status: 307, location: "https://spotify.app.link/aBcD3fGh1Jb?_p=1" },
      "https://spotify.app.link/aBcD3fGh1Jb?_p=1": { status: 301, location: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc" },
    });
    await expect(resolveShortLink("https://spotify.link/aBcD3fGh1Jb", { hop }))
      .resolves.toBe("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc");
    expect(calls).toHaveLength(2);
  });

  it("une redirection relative reste sur l'hote courant", async () => {
    const { hop, calls } = fakeHop({
      "https://deezer.page.link/abc": { status: 302, location: "/abc?d=1" },
      "https://deezer.page.link/abc?d=1": { status: 302, location: "https://deezer.com/playlist/42" },
    });
    await expect(resolveShortLink("https://deezer.page.link/abc", { hop })).resolves.toBe("https://deezer.com/playlist/42");
    expect(calls).toEqual(["https://deezer.page.link/abc", "https://deezer.page.link/abc?d=1"]);
  });

  it.each([
    "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    "http://spotify.link/x",
    "https://spotify.link:8443/x",
    "https://127.0.0.1/x",
    "https://localhost/x",
    "https://[::1]/x",
    "https://192.168.1.1/x",
    "file:///etc/passwd",
  ])("depart hors liste, aucun appel : %s", async raw => {
    const { hop, calls } = fakeHop({});
    expect(await codeOf(resolveShortLink(raw, { hop }))).toBe("not_short_link");
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["hote hors liste", "https://evil.com/playlist/1"],
    ["sous-domaine pirate", "https://open.spotify.com.evil.com/playlist/1"],
    ["http", "http://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"],
    ["port exotique", "https://open.spotify.com:8443/playlist/37i9dQZF1DXcBWIGoYBM5M"],
    ["identifiants", "https://user@open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"],
    ["hote encode dans les identifiants", "https://open.spotify.com%2F@evil.com/"],
    ["antislash", "https://evil.com\\@open.spotify.com/"],
    ["IP de boucle", "https://127.0.0.1/"],
    ["IP privee", "https://10.1.2.3/"],
    ["metadonnees du nuage", "https://169.254.169.254/latest/meta-data"],
    ["IPv6 locale", "https://[::1]/"],
    ["localhost", "https://localhost:3000/"],
    ["schema data", "data:text/html,<script>alert(1)</script>"],
    ["schema javascript", "javascript:alert(1)"],
    ["schema file", "file:///etc/passwd"],
    ["sans schema vers un autre hote", "//evil.com/x"],
  ])("redirection refusee net (%s), sans saut de plus", async (_cas, location) => {
    const { hop, calls } = fakeHop({ "https://spotify.link/x": { status: 302, location } });
    expect(await codeOf(resolveShortLink("https://spotify.link/x", { hop }))).toBe("redirect_refused");
    expect(calls).toEqual(["https://spotify.link/x"]);
  });

  it("ne decode pas l'adresse : un %2F reste un %2F", async () => {
    const encoded = "https://open.spotify.com/playlist/%2e%2e%2f%2e%2e%2fapi%2ftoken";
    const { hop } = fakeHop({ "https://spotify.link/x": { status: 302, location: encoded } });
    await expect(resolveShortLink("https://spotify.link/x", { hop })).resolves.toBe(encoded);
  });

  it("une adresse encodee relative ne quitte pas l'hote courant", async () => {
    const { hop, calls } = fakeHop({
      "https://spotify.link/x": { status: 302, location: "https%3A%2F%2Fevil.com%2F" },
      "https://spotify.link/https%3A%2F%2Fevil.com%2F": { status: 404 },
    });
    expect(await codeOf(resolveShortLink("https://spotify.link/x", { hop }))).toBe("no_redirect");
    expect(calls.every(c => c.startsWith("https://spotify.link/"))).toBe(true);
  });

  it(`au plus ${MAX_REDIRECTS} redirections`, async () => {
    const routes: Record<string, { status: number; location: string }> = {};
    for (let i = 0; i < 10; i += 1) routes[`https://spotify.link/${i}`] = { status: 302, location: `/${i + 1}` };
    const { hop, calls } = fakeHop(routes);
    expect(await codeOf(resolveShortLink("https://spotify.link/0", { hop }))).toBe("too_many_redirects");
    expect(calls).toHaveLength(MAX_REDIRECTS);
  });

  it.each([
    ["page sans redirection", { status: 200 }],
    ["introuvable", { status: 404 }],
    ["302 sans Location", { status: 302 }],
    ["304", { status: 304, location: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" }],
  ])("%s : no_redirect", async (_cas, route) => {
    const { hop } = fakeHop({ "https://spotify.link/x": route });
    expect(await codeOf(resolveShortLink("https://spotify.link/x", { hop }))).toBe("no_redirect");
  });

  it("une erreur reseau devient unreachable", async () => {
    const { hop } = fakeHop({ "https://spotify.link/x": new Error("ECONNRESET") });
    expect(await codeOf(resolveShortLink("https://spotify.link/x", { hop }))).toBe("unreachable");
  });

  it("borne le nombre de resolutions simultanees", async () => {
    const pending: Array<() => void> = [];
    const hop: Hop = () => new Promise(resolve => {
      pending.push(() => resolve({ status: 302, location: "https://open.spotify.com/user/abc" }));
    });
    const running = Array.from({ length: 5 }, () => resolveShortLink("https://spotify.link/x", { hop }));
    expect(await codeOf(resolveShortLink("https://spotify.link/x", { hop }))).toBe("busy");
    pending.forEach(release => release());
    await expect(Promise.all(running)).resolves.toHaveLength(5);
    // Les places se liberent : une nouvelle resolution passe.
    const instant: Hop = async () => ({ status: 302, location: "https://open.spotify.com/user/abc" });
    await expect(resolveShortLink("https://spotify.link/x", { hop: instant })).resolves.toBe("https://open.spotify.com/user/abc");
  });
});

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "127.1.2.3", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.0.1",
    "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "pas une ip",
  ])("refuse %s", ip => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["151.101.2.1", "35.186.224.25", "2600:1901:0:1::1", "::ffff:151.101.2.1"])("accepte %s", ip => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe("safeLookup", () => {
  it("refuse un nom qui resout vers la boucle locale", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>(resolve => {
      safeLookup("localhost", { all: true }, e => resolve(e));
    });
    expect(err?.code).toBe("EBLOCKEDADDRESS");
  });
});

describe("pile de test (SHORT_LINK_TEST_BASE)", () => {
  const saved = process.env.SHORT_LINK_TEST_BASE;
  let server: http.Server | null = null;

  afterEach(async () => {
    if (saved === undefined) delete process.env.SHORT_LINK_TEST_BASE;
    else process.env.SHORT_LINK_TEST_BASE = saved;
    server?.closeAllConnections();
    if (server) await new Promise(r => server?.close(r));
    server = null;
  });

  it.each([
    "http://example.com/stub",
    "https://10.0.0.1/stub",
    "http://127.0.0.1.evil.com/stub",
    "pas une adresse",
  ])("ignoree si elle ne vise pas la boucle locale : %s", base => {
    process.env.SHORT_LINK_TEST_BASE = base;
    expect(shortLinkTestBase()).toBeNull();
  });

  it("suit la redirection du faux hebergeur, en GET, sans lire le corps", async () => {
    const seen: Array<{ method?: string; url?: string }> = [];
    server = http.createServer((req, res) => {
      seen.push({ method: req.method, url: req.url });
      res.writeHead(302, { Location: "https://www.deezer.com/fr/playlist/42" });
      res.end("x".repeat(64 * 1024));
    });
    await new Promise<void>(r => server?.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    process.env.SHORT_LINK_TEST_BASE = `http://127.0.0.1:${port}/short-link-stub`;

    await expect(resolveShortLink("https://link.deezer.com/s/abc?x=1")).resolves.toBe("https://www.deezer.com/fr/playlist/42");
    expect(seen).toEqual([{ method: "GET", url: "/short-link-stub/link.deezer.com/s/abc?x=1" }]);
  });

  it("un hebergeur muet coupe au bout du delai", async () => {
    server = http.createServer(() => { /* ne repond jamais */ });
    await new Promise<void>(r => server?.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    process.env.SHORT_LINK_TEST_BASE = `http://127.0.0.1:${port}`;

    const started = Date.now();
    expect(await codeOf(resolveShortLink("https://spotify.link/x", { timeoutMs: 200 }))).toBe("unreachable");
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
