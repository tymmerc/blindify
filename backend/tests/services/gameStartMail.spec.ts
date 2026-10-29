// Envoi du mail de debut de partie (T18) : meme configuration que la sonde de
// prod (ALERTE_DESTINATAIRE, ALERTE_EXPEDITEUR, RESEND_CLE_FICHIER), un seul
// essai, jamais d'exception, jamais de cle ni d'adresse dans le detail.
import {
  RESEND_URL,
  buildOverflowMail,
  buildStartMail,
  loadNotifConfig,
  resendTestBase,
  sendNotifMail,
} from "../../src/services/gameStartMail";

const KEY = "re_TESTKEY_1234567890abcdef";
const files: Record<string, string> = { "/secrets/resend.env": `OTHER=1\nRESEND_API_KEY="${KEY}"\r\n` };
const readFile = (file: string) => {
  if (!(file in files)) throw new Error("ENOENT");
  return files[file];
};
const ENV = {
  ALERTE_DESTINATAIRE: "tym@example.test",
  ALERTE_EXPEDITEUR: "Blindz <alerte@example.test>",
  RESEND_CLE_FICHIER: "/secrets/resend.env",
};

describe("loadNotifConfig", () => {
  it("config complete : rien ne manque", () => {
    const c = loadNotifConfig({ env: ENV, readFile });
    expect(c.missing).toEqual([]);
    expect(c.key).toBe(KEY);
    expect(c.to).toBe("tym@example.test");
  });

  it("ce qui manque est nomme, sans jamais une valeur", () => {
    const c = loadNotifConfig({ env: { ALERTE_EXPEDITEUR: "pas une adresse", RESEND_CLE_FICHIER: "relatif.env" }, readFile });
    expect(c.missing).toHaveLength(3);
    expect(c.missing.join(" ")).toMatch(/ALERTE_DESTINATAIRE.*ALERTE_EXPEDITEUR.*RESEND_CLE_FICHIER/);
    expect(c.missing.join(" ")).not.toContain("pas une adresse");
  });

  it("fichier de cle illisible : manque, pas d'exception", () => {
    const c = loadNotifConfig({ env: { ...ENV, RESEND_CLE_FICHIER: "/absent.env" }, readFile });
    expect(c.key).toBeNull();
    expect(c.missing).toEqual([expect.stringContaining("RESEND_CLE_FICHIER")]);
  });
});

describe("resendTestBase", () => {
  it("ignoree hors du garde-fou no-egress de la pile", () => {
    expect(resendTestBase({ NOTIF_PARTIE_TEST_BASE: "http://127.0.0.1:3180/resend-stub" }, false)).toBeNull();
  });
  it("sous le garde-fou : boucle locale en http seulement", () => {
    expect(resendTestBase({ NOTIF_PARTIE_TEST_BASE: "http://127.0.0.1:3180/resend-stub" }, true)).toBe("http://127.0.0.1:3180/resend-stub");
    expect(resendTestBase({ NOTIF_PARTIE_TEST_BASE: "https://api.resend.com/emails" }, true)).toBeNull();
    expect(resendTestBase({ NOTIF_PARTIE_TEST_BASE: "http://evil.example/x" }, true)).toBeNull();
  });
});

describe("sendNotifMail", () => {
  const config = loadNotifConfig({ env: ENV, readFile });
  const mail = { subject: "s", text: "t" };

  it("POST Resend avec la cle, un seul essai", async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "{}" });
    await expect(sendNotifMail({ fetchFn, config, mail })).resolves.toEqual({ sent: true, detail: "envoye" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(RESEND_URL);
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body)).toEqual({ from: ENV.ALERTE_EXPEDITEUR, to: [ENV.ALERTE_DESTINATAIRE], subject: "s", text: "t" });
  });

  it("refus de Resend : pas de nouvel essai, detail sans cle ni adresse", async () => {
    const body = JSON.stringify({ name: "validation_error", message: `You can only send to tym@example.test with ${KEY}` });
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => body });
    const res = await sendNotifMail({ fetchFn, config, mail });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(res.sent).toBe(false);
    expect(res.detail).toContain("HTTP 429");
    expect(res.detail).not.toContain(KEY);
    expect(res.detail).not.toContain("tym@example.test");
  });

  it("reseau coupe : rendu propre, aucune exception", async () => {
    const fetchFn = jest.fn().mockRejectedValue(Object.assign(new Error("boom"), { name: "TypeError" }));
    await expect(sendNotifMail({ fetchFn, config, mail })).resolves.toEqual({ sent: false, detail: "Resend injoignable (TypeError)" });
  });

  it("config incomplete : rien n'est envoye", async () => {
    const fetchFn = jest.fn();
    const res = await sendNotifMail({ fetchFn, config: loadNotifConfig({ env: {}, readFile }), mail });
    expect(res.sent).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("buildStartMail", () => {
  const base = {
    mode: "friends",
    discord: false,
    players: [{ id: 1, username: "Julie" }, { id: 2, username: "Paul\u0000\n<b>" }, { id: 3, username: null }],
    providers: ["spotify", "spotify", "deezer"],
    startedAt: Date.UTC(2026, 9, 25, 22, 14), // 23 h 14 a Paris (heure d'hiver)
    link: "https://blindz.app/spectateur/?salle=ABCD12&jeton=x",
  };

  it("mode, joueurs, heure de Paris, musique, lien", () => {
    const { subject, text } = buildStartMail(base);
    expect(subject).toBe("Blindz : une partie à 3 vient de démarrer (À distance)");
    expect(text).toContain("Mode : À distance");
    expect(text).toContain("Joueurs (3) : Julie, Paul <b>, Joueur");
    expect(text).toContain("23:14");
    expect(text).toContain("Musique : Spotify et Deezer");
    expect(text).toContain(base.link);
  });

  it("Discord et Autour d'une table", () => {
    expect(buildStartMail({ ...base, discord: true }).text).toContain("Mode : Discord");
    expect(buildStartMail({ ...base, mode: "event", providers: ["deezer"] }).text).toMatch(/Mode : Autour d'une table[\s\S]*Musique : Deezer/);
  });

  it("sans secret spectateur : le mail le dit, sans lien", () => {
    const { text } = buildStartMail({ ...base, link: null });
    expect(text).toContain("SPECTATEUR_SECRET");
    expect(text).not.toContain("/spectateur/");
  });

  it("rien d'autre sur les joueurs : ni id, ni titre", () => {
    const { text } = buildStartMail(base);
    expect(text).not.toMatch(/\b(1|2|3)\b.*@/);
    expect(text).not.toMatch(/titre/i);
  });
});

describe("buildOverflowMail", () => {
  it("et N autres salles", () => {
    expect(buildOverflowMail({ count: 4, dayLabel: "25/10" }).subject).toBe("Blindz : et 4 autres salles aujourd'hui (25/10)");
    expect(buildOverflowMail({ count: 1, dayLabel: "25/10" }).subject).toBe("Blindz : et 1 autre salle aujourd'hui (25/10)");
  });
});
