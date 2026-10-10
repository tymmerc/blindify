import {
  LOCAL_DEV_ORIGINS,
  buildAllowedOrigins,
  isSocketOriginAllowed,
  matchesAllowedOrigin,
} from "../../src/utils/origins";

describe("buildAllowedOrigins", () => {
  it("prod : https://blindz.app et rien d'autre", () => {
    const { origins, ignored } = buildAllowedOrigins({ frontendUrl: "https://blindz.app", isProd: true });

    expect(origins).toEqual(["https://blindz.app"]);
    expect(ignored).toEqual([]);
  });

  it("prod : plus aucune origine tymmerc.eu ni localhost", () => {
    const { origins } = buildAllowedOrigins({ frontendUrl: "https://blindz.app/", isProd: true });

    expect(origins).toEqual(["https://blindz.app"]);
    expect(origins.some(o => o.includes("tymmerc.eu"))).toBe(false);
    expect(origins.some(o => o.includes("localhost"))).toBe(false);
  });

  it("dev servi sous /blindify : origine nue (en-tete Origin) ET URL complete (Referer)", () => {
    const { origins } = buildAllowedOrigins({ frontendUrl: "https://dev.tymmerc.eu/blindify/", isProd: true });

    expect(origins).toEqual(["https://dev.tymmerc.eu", "https://dev.tymmerc.eu/blindify"]);
  });

  it("dev tel que configure aujourd'hui (FRONTEND_URL sans chemin)", () => {
    const { origins } = buildAllowedOrigins({ frontendUrl: "https://dev.tymmerc.eu", isProd: true });

    expect(origins).toEqual(["https://dev.tymmerc.eu"]);
  });

  it("pile de test isolee : son FRONTEND_URL, port compris", () => {
    const { origins } = buildAllowedOrigins({ frontendUrl: "http://blindz-test.localhost:3180", isProd: true });

    expect(origins).toEqual(["http://blindz-test.localhost:3180"]);
  });

  it("normalise l'hote en minuscules et retire le port par defaut", () => {
    const { origins } = buildAllowedOrigins({ frontendUrl: "https://Blindz.App:443", isProd: true });

    expect(origins).toEqual(["https://blindz.app"]);
  });

  it("ajoute les origines localhost seulement hors production", () => {
    const horsProd = buildAllowedOrigins({ frontendUrl: "https://blindz.app", isProd: false }).origins;
    const prod = buildAllowedOrigins({ frontendUrl: "https://blindz.app", isProd: true }).origins;

    expect(horsProd).toEqual(["https://blindz.app", ...LOCAL_DEV_ORIGINS]);
    LOCAL_DEV_ORIGINS.forEach(o => expect(prod).not.toContain(o));
  });

  it("ALLOWED_ORIGINS : liste separee par des virgules, espaces toleres", () => {
    const { origins, ignored } = buildAllowedOrigins({
      frontendUrl: "https://blindz.app",
      extra: " https://a.example , https://b.example/app/ ",
      isProd: true,
    });

    expect(origins).toEqual(["https://blindz.app", "https://a.example", "https://b.example", "https://b.example/app"]);
    expect(ignored).toEqual([]);
  });

  it("ALLOWED_ORIGINS vide ou fait de virgules : rien n'est ajoute", () => {
    expect(buildAllowedOrigins({ frontendUrl: "https://blindz.app", extra: "", isProd: true }).origins)
      .toEqual(["https://blindz.app"]);
    expect(buildAllowedOrigins({ frontendUrl: "https://blindz.app", extra: " , ,", isProd: true }).origins)
      .toEqual(["https://blindz.app"]);
  });

  it("ALLOWED_ORIGINS : pas de doublon avec FRONTEND_URL", () => {
    const { origins } = buildAllowedOrigins({
      frontendUrl: "https://blindz.app",
      extra: "https://blindz.app/,https://blindz.app",
      isProd: true,
    });

    expect(origins).toEqual(["https://blindz.app"]);
  });

  it("ignore et signale les entrees invalides, '*' et 'null' compris (jamais de joker depuis l'env)", () => {
    const { origins, ignored } = buildAllowedOrigins({
      frontendUrl: "https://blindz.app",
      extra: "*,null,ftp://files.example,blindz.app,https://ok.example",
      isProd: true,
    });

    expect(origins).toEqual(["https://blindz.app", "https://ok.example"]);
    expect(ignored).toEqual(["*", "null", "ftp://files.example", "blindz.app"]);
  });

  it("FRONTEND_URL invalide : liste vide en prod (tout refuser) et entree signalee", () => {
    const { origins, ignored } = buildAllowedOrigins({ frontendUrl: "blindz.app", isProd: true });

    expect(origins).toEqual([]);
    expect(ignored).toEqual(["blindz.app"]);
  });
});

describe("matchesAllowedOrigin (middleware CSRF, Origin ou Referer)", () => {
  const prod = ["https://blindz.app"];
  const dev = ["https://dev.tymmerc.eu", "https://dev.tymmerc.eu/blindify"];

  it("accepte l'origine exacte et un Referer sous cette origine", () => {
    expect(matchesAllowedOrigin("https://blindz.app", prod)).toBe(true);
    expect(matchesAllowedOrigin("https://blindz.app/jouer/?code=ABCD", prod)).toBe(true);
    expect(matchesAllowedOrigin("https://dev.tymmerc.eu/blindify/jouer/", dev)).toBe(true);
  });

  it("refuse une origine forgee qui commence comme la vraie", () => {
    expect(matchesAllowedOrigin("https://blindz.app.evil.com", prod)).toBe(false);
    expect(matchesAllowedOrigin("https://blindz.app.evil.com/x", prod)).toBe(false);
    expect(matchesAllowedOrigin("https://blindz.appx", prod)).toBe(false);
  });

  it("refuse les anciennes origines, 'null' et la valeur vide", () => {
    expect(matchesAllowedOrigin("https://tymmerc.eu", prod)).toBe(false);
    expect(matchesAllowedOrigin("https://tymmerc.eu/blindify/", prod)).toBe(false);
    expect(matchesAllowedOrigin("http://localhost:3000", prod)).toBe(false);
    expect(matchesAllowedOrigin("null", prod)).toBe(false);
    expect(matchesAllowedOrigin("", prod)).toBe(false);
  });
});

describe("isSocketOriginAllowed (handshake socket.io)", () => {
  const prod = ["https://blindz.app"];

  it("accepte un handshake sans Origin (client Node : scripts E2E, bots)", () => {
    expect(isSocketOriginAllowed(undefined, prod)).toBe(true);
    expect(isSocketOriginAllowed("", prod)).toBe(true);
  });

  it("accepte l'origine du front", () => {
    expect(isSocketOriginAllowed("https://blindz.app", prod)).toBe(true);
  });

  it("refuse une origine etrangere, forgee ou opaque", () => {
    expect(isSocketOriginAllowed("https://evil.example", prod)).toBe(false);
    expect(isSocketOriginAllowed("https://blindz.app.evil.com", prod)).toBe(false);
    expect(isSocketOriginAllowed("https://tymmerc.eu", prod)).toBe(false);
    expect(isSocketOriginAllowed("null", prod)).toBe(false);
  });

  it("une URL avec chemin dans la liste ne valide jamais un Origin par prefixe", () => {
    expect(isSocketOriginAllowed("https://dev.tymmerc.eu", ["https://dev.tymmerc.eu/blindify"])).toBe(false);
  });

  it("la liste ['*'] du harnais de test d'integration accepte tout", () => {
    expect(isSocketOriginAllowed("https://ok.test", ["*"])).toBe(true);
    expect(isSocketOriginAllowed("https://evil.test", ["*"])).toBe(true);
  });
});

// Activite Discord : la page est servie par le proxy de Discord sous
// https://<id de l'appli>.discordsays.com, et c'est cette origine que le
// navigateur presente a l'API et au socket. Elle s'ouvre avec DISCORD_CLIENT_ID,
// jamais en dur : sans variable, rien ne change.
describe("buildAllowedOrigins : origine de l'Activite Discord", () => {
  it("ajoute https://<id>.discordsays.com quand DISCORD_CLIENT_ID est un identifiant Discord", () => {
    const { origins, ignored } = buildAllowedOrigins({
      frontendUrl: "https://blindz.app",
      discordClientId: "123456789012345678",
      isProd: true,
    });

    expect(origins).toEqual(["https://blindz.app", "https://123456789012345678.discordsays.com"]);
    expect(ignored).toEqual([]);
  });

  it("sans DISCORD_CLIENT_ID (absent ou vide) : la liste ne bouge pas", () => {
    expect(buildAllowedOrigins({ frontendUrl: "https://blindz.app", isProd: true }).origins)
      .toEqual(["https://blindz.app"]);
    expect(buildAllowedOrigins({ frontendUrl: "https://blindz.app", discordClientId: "  ", isProd: true }).origins)
      .toEqual(["https://blindz.app"]);
  });

  it("un identifiant qui n'a pas la forme d'un identifiant Discord n'ouvre aucune origine, et il est signale", () => {
    const { origins, ignored } = buildAllowedOrigins({
      frontendUrl: "https://blindz.app",
      // Un identifiant est une suite de chiffres (snowflake) : rien d'autre ne
      // doit pouvoir fabriquer une origine, par exemple "evil.com/" ou "*".
      discordClientId: "evil.com",
      isProd: true,
    });

    expect(origins).toEqual(["https://blindz.app"]);
    // Sans la valeur : si identifiant et secret sont intervertis, le secret ne doit pas partir dans le journal.
    expect(ignored).toEqual(["DISCORD_CLIENT_ID (format invalide)"]);
    expect(JSON.stringify(ignored)).not.toContain("evil.com");
  });

  it("l'origine Discord passe le filtre CSRF et le handshake socket", () => {
    const { origins } = buildAllowedOrigins({
      frontendUrl: "https://blindz.app",
      discordClientId: "123456789012345678",
      isProd: true,
    });

    expect(matchesAllowedOrigin("https://123456789012345678.discordsays.com", origins)).toBe(true);
    expect(matchesAllowedOrigin("https://123456789012345678.discordsays.com/", origins)).toBe(true);
    expect(isSocketOriginAllowed("https://123456789012345678.discordsays.com", origins)).toBe(true);
    // Une autre appli Discord n'est pas la notre.
    expect(isSocketOriginAllowed("https://999999999999999999.discordsays.com", origins)).toBe(false);
  });
});
