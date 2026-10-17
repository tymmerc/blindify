// Lecture de la configuration de l'Activite Discord (variables d'environnement).
// Le secret ne sort jamais d'ici : il n'est lu que par l'echange du code OAuth2.
import {
  DISCORD_CLIENT_ID_PATTERN,
  discordActivityOrigin,
  discordApiBase,
  readDiscordCredentials,
} from "../../src/config/discord";

describe("readDiscordCredentials", () => {
  it("rend l'identifiant et le secret quand les deux sont la", () => {
    const result = readDiscordCredentials({ DISCORD_CLIENT_ID: " 123456789012345678 ", DISCORD_CLIENT_SECRET: "s3cret" });

    expect(result).toEqual({ ok: true, credentials: { clientId: "123456789012345678", clientSecret: "s3cret" } });
  });

  it("Activite desactivee proprement sans variable", () => {
    expect(readDiscordCredentials({})).toEqual({ ok: false, reason: "absent" });
    expect(readDiscordCredentials({ DISCORD_CLIENT_ID: "", DISCORD_CLIENT_SECRET: "" })).toEqual({ ok: false, reason: "absent" });
  });

  it("refuse un identifiant qui n'est pas un identifiant Discord (suite de chiffres)", () => {
    expect(readDiscordCredentials({ DISCORD_CLIENT_ID: "abc", DISCORD_CLIENT_SECRET: "s" }))
      .toEqual({ ok: false, reason: "client_id_invalide" });
    expect(DISCORD_CLIENT_ID_PATTERN.test("123456789012345678")).toBe(true);
    expect(DISCORD_CLIENT_ID_PATTERN.test("1234")).toBe(false);
  });

  it("identifiant present mais secret absent : desactivee, avec la raison", () => {
    expect(readDiscordCredentials({ DISCORD_CLIENT_ID: "123456789012345678" }))
      .toEqual({ ok: false, reason: "secret_absent" });
  });
});

describe("discordApiBase", () => {
  it("vise l'API officielle par defaut", () => {
    expect(discordApiBase({})).toBe("https://discord.com/api/v10");
  });

  it("se surcharge pour la pile de test (faux Discord local), sans barre finale", () => {
    expect(discordApiBase({ DISCORD_API_BASE: "http://127.0.0.1:3180/discord-stub/" })).toBe("http://127.0.0.1:3180/discord-stub");
  });
});

describe("discordActivityOrigin", () => {
  it("construit l'origine servie par le proxy de Discord", () => {
    expect(discordActivityOrigin("123456789012345678")).toBe("https://123456789012345678.discordsays.com");
  });
});
