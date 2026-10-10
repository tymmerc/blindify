// Echange du code OAuth2 de l'Activite Discord contre un jeton, puis lecture de
// l'utilisateur Discord. Tout passe par un fetch injecte : aucun appel reseau.
import {
  DiscordAuthError,
  discordAvatarUrl,
  discordDisplayName,
  exchangeCode,
  fetchDiscordUser,
  isValidAuthCode,
} from "../../src/services/discordAuth";

const CREDS = { clientId: "123456789012345678", clientSecret: "s3cret" };

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  delete process.env.DISCORD_API_BASE;
});

describe("isValidAuthCode", () => {
  it("accepte un code OAuth2 (lettres, chiffres, . _ ~ -), jusqu'a 256 caracteres", () => {
    expect(isValidAuthCode("AbC123-_.~")).toBe(true);
    expect(isValidAuthCode("a".repeat(256))).toBe(true);
  });

  it("refuse tout le reste : vide, trop long, espaces, autre type", () => {
    expect(isValidAuthCode("")).toBe(false);
    expect(isValidAuthCode("a".repeat(257))).toBe(false);
    expect(isValidAuthCode("code avec espace")).toBe(false);
    expect(isValidAuthCode("code&x=1")).toBe(false);
    expect(isValidAuthCode(42)).toBe(false);
    expect(isValidAuthCode(undefined)).toBe(false);
  });
});

describe("exchangeCode", () => {
  it("envoie le code et le secret a Discord en formulaire, sans redirect_uri (flux d'une Activite)", async () => {
    const fetchImpl: FetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, { access_token: "tok", token_type: "Bearer", expires_in: 604800, refresh_token: "refresh", scope: "identify" }),
    );

    const result = await exchangeCode("le-code", CREDS, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://discord.com/api/v10/oauth2/token");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("client_id")).toBe(CREDS.clientId);
    expect(form.get("client_secret")).toBe(CREDS.clientSecret);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("le-code");
    expect(form.has("redirect_uri")).toBe(false);
    // Un appel qui ne repond pas ne doit pas bloquer la requete du joueur.
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    // Le jeton de rafraichissement n'est ni garde ni renvoye : on ne rappelle jamais Discord plus tard.
    expect(result).toEqual({ accessToken: "tok", expiresIn: 604800 });
  });

  it("suit DISCORD_API_BASE (faux Discord de la pile de test)", async () => {
    process.env.DISCORD_API_BASE = "http://127.0.0.1:3180/discord-stub";
    const fetchImpl: FetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { access_token: "tok" }));

    await exchangeCode("c", CREDS, { fetchImpl });

    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://127.0.0.1:3180/discord-stub/oauth2/token");
  });

  it("code refuse par Discord (400 ou 401) : erreur code_rejected", async () => {
    const fetchImpl: FetchMock = jest.fn().mockResolvedValue(jsonResponse(400, { error: "invalid_grant" }));

    await expect(exchangeCode("mauvais", CREDS, { fetchImpl })).rejects.toMatchObject({
      name: "DiscordAuthError",
      kind: "code_rejected",
      status: 400,
    });
  });

  it("Discord en panne (5xx), reponse sans jeton ou reseau coupe : erreur unavailable", async () => {
    const panne: FetchMock = jest.fn().mockResolvedValue(jsonResponse(503, {}));
    await expect(exchangeCode("c", CREDS, { fetchImpl: panne })).rejects.toMatchObject({ kind: "unavailable", status: 503 });

    const sansJeton: FetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { token_type: "Bearer" }));
    await expect(exchangeCode("c", CREDS, { fetchImpl: sansJeton })).rejects.toMatchObject({ kind: "unavailable" });

    const reseau: FetchMock = jest.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(exchangeCode("c", CREDS, { fetchImpl: reseau })).rejects.toBeInstanceOf(DiscordAuthError);
    await expect(exchangeCode("c", CREDS, { fetchImpl: reseau })).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("fetchDiscordUser", () => {
  it("lit l'utilisateur avec le jeton d'acces, cote serveur", async () => {
    const fetchImpl: FetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, { id: "987654321098765432", username: "tym", global_name: "Tym M.", avatar: "a1b2c3", discriminator: "0" }),
    );

    const user = await fetchDiscordUser("tok", { fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://discord.com/api/v10/users/@me");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(user).toEqual({ id: "987654321098765432", username: "tym", globalName: "Tym M.", avatar: "a1b2c3" });
  });

  it("champs optionnels absents : null, jamais undefined", async () => {
    const fetchImpl: FetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { id: "987654321098765432", username: "tym" }));

    expect(await fetchDiscordUser("tok", { fetchImpl })).toEqual({ id: "987654321098765432", username: "tym", globalName: null, avatar: null });
  });

  it("jeton refuse : code_rejected ; reponse illisible (id qui n'est pas un identifiant) : unavailable", async () => {
    const refuse: FetchMock = jest.fn().mockResolvedValue(jsonResponse(401, { message: "401: Unauthorized" }));
    await expect(fetchDiscordUser("tok", { fetchImpl: refuse })).rejects.toMatchObject({ kind: "code_rejected", status: 401 });

    const bizarre: FetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { id: "<script>", username: "x" }));
    await expect(fetchDiscordUser("tok", { fetchImpl: bizarre })).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("discordAvatarUrl et discordDisplayName", () => {
  it("construit l'adresse CDN de l'avatar seulement a partir d'une empreinte propre", () => {
    expect(discordAvatarUrl({ id: "987654321098765432", avatar: "a_1b2c3" }))
      .toBe("https://cdn.discordapp.com/avatars/987654321098765432/a_1b2c3.png?size=128");
    expect(discordAvatarUrl({ id: "987654321098765432", avatar: null })).toBeNull();
    expect(discordAvatarUrl({ id: "987654321098765432", avatar: "../x" })).toBeNull();
  });

  it("prefere le nom affiche, sinon le pseudo, borne a 120 caracteres", () => {
    expect(discordDisplayName({ id: "1", username: "tym", globalName: "Tym M.", avatar: null })).toBe("Tym M.");
    expect(discordDisplayName({ id: "1", username: "tym", globalName: "   ", avatar: null })).toBe("tym");
    expect(discordDisplayName({ id: "1", username: "x".repeat(200), globalName: null, avatar: null })).toHaveLength(120);
  });
});
