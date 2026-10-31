// Chat Twitch (T5b) : lignes IRC, reponses `!b titre - artiste`, nom de
// chaine, et le lecteur (connexion anonyme, PING, plafond, reprise).

import { anonymousNick, chatLineOf, cleanChannel, parseChatAnswer, parseIrcLine } from "../../src/services/twitchChat";
import { openTwitchReader, type WsLike } from "../../src/services/twitchReader";

describe("nom de chaine", () => {
  it.each([
    ["tymmerc", "tymmerc"],
    ["  TymMerc ", "tymmerc"],
    ["#tymmerc", "tymmerc"],
    ["https://www.twitch.tv/tymmerc/", "tymmerc"],
    ["ab", null],
    ["x".repeat(26), null],
    ["tym merc", null],
    ["tym-merc", null],
    ["<script>", null],
    [42, null],
  ])("%p -> %p", (raw, expected) => {
    expect(cleanChannel(raw)).toBe(expected);
  });
});

describe("reponses du chat", () => {
  it("titre et artiste separes par un tiret entoure d'espaces", () => {
    expect(parseChatAnswer("!b Chocolat - Naza")).toEqual({ title: "Chocolat", artist: "Naza" });
    expect(parseChatAnswer("  !B   chocolat – naza ")).toEqual({ title: "chocolat", artist: "naza" });
    expect(parseChatAnswer("!b Hey-Oh - Tragedie")).toEqual({ title: "Hey-Oh", artist: "Tragedie" });
  });

  it("sans tiret, tout est le titre", () => {
    expect(parseChatAnswer("!b chocolat")).toEqual({ title: "chocolat", artist: "" });
  });

  it("le prefixe est obligatoire, suivi d'un espace", () => {
    expect(parseChatAnswer("chocolat - naza")).toBeNull();
    expect(parseChatAnswer("!bonjour tout le monde")).toBeNull();
    expect(parseChatAnswer("!b")).toBeNull();
    expect(parseChatAnswer("!b    ")).toBeNull();
  });

  it("une reponse trop longue est coupee", () => {
    expect(parseChatAnswer(`!b ${"a".repeat(500)}`)?.title.length).toBe(120);
  });
});

describe("lignes IRC", () => {
  const privmsg = "@badge-info=;display-name=Lena_42;user-id=1 :lena_42!lena_42@lena_42.tmi.twitch.tv PRIVMSG #tymmerc :!b chocolat - naza";

  it("PRIVMSG avec tags : chaine, login, nom affiche, texte", () => {
    const msg = parseIrcLine(privmsg);
    expect(msg?.command).toBe("PRIVMSG");
    expect(chatLineOf(msg!)).toEqual({ channel: "tymmerc", login: "lena_42", displayName: "Lena_42", text: "!b chocolat - naza" });
  });

  it("un nom affiche exotique retombe sur le login", () => {
    const msg = parseIrcLine("@display-name=\\s<b>x</b> :lena!lena@lena.tmi.twitch.tv PRIVMSG #tymmerc :salut");
    expect(chatLineOf(msg!)?.displayName).toBe("lena");
  });

  it("PING, bienvenue, et lignes invalides", () => {
    expect(parseIrcLine("PING :tmi.twitch.tv")).toMatchObject({ command: "PING", params: ["tmi.twitch.tv"] });
    expect(parseIrcLine(":tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!")?.command).toBe("001");
    expect(parseIrcLine("")).toBeNull();
    expect(parseIrcLine("@tags-sans-fin")).toBeNull();
    expect(chatLineOf(parseIrcLine(":tmi.twitch.tv NOTICE * :x")!)).toBeNull();
  });

  it("pseudo anonyme justinfan", () => {
    expect(anonymousNick(() => 0.5)).toMatch(/^justinfan\d{5}$/);
  });
});

class FakeWs implements WsLike {
  static all: FakeWs[] = [];
  sent: string[] = [];
  closed = false;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeWs.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.({});
  }
  receive(text: string) {
    this.onmessage?.({ data: text });
  }
}

describe("lecteur du chat", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    FakeWs.all = [];
  });
  afterEach(() => jest.useRealTimers());

  const line = (login: string, text: string) => `@display-name=${login} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #tymmerc :${text}`;

  function reader(maxPerSecond = 50) {
    const lines: string[] = [];
    const statuses: string[] = [];
    let t = 0;
    const r = openTwitchReader({
      channel: "tymmerc",
      url: "ws://faux",
      openSocket: url => new FakeWs(url),
      onLine: l => lines.push(`${l.login}:${l.text}`),
      onStatus: s => statuses.push(s),
      now: () => t,
      maxPerSecond,
    });
    return { r, lines, statuses, tick: (ms: number) => { t += ms; } };
  }

  it("se presente en anonyme, rejoint la chaine, repond au PING", () => {
    const { statuses } = reader();
    const ws = FakeWs.all[0];
    ws.onopen?.({});
    expect(ws.sent[0]).toBe("CAP REQ :twitch.tv/tags");
    expect(ws.sent[1]).toMatch(/^NICK justinfan\d+$/);
    expect(ws.sent[2]).toBe("JOIN #tymmerc");
    expect(ws.sent.some(s => s.startsWith("PASS"))).toBe(false);
    ws.receive(":tmi.twitch.tv 001 justinfan1 :Welcome\r\nPING :tmi.twitch.tv\r\n");
    expect(ws.sent).toContain("PONG :tmi.twitch.tv");
    expect(statuses).toEqual(["connexion", "connecte"]);
  });

  it("ne garde que les messages de sa chaine", () => {
    const { lines } = reader();
    const ws = FakeWs.all[0];
    ws.receive(`${line("lena", "!b a - b")}\r\n:zoe!zoe@zoe.tmi.twitch.tv PRIVMSG #autre :!b x`);
    expect(lines).toEqual(["lena:!b a - b"]);
  });

  it("au-dela du plafond par seconde, le surplus est ignore", () => {
    const { lines, tick } = reader(3);
    const ws = FakeWs.all[0];
    for (let i = 0; i < 10; i++) ws.receive(line(`viewer${i}`, "!b x"));
    expect(lines).toHaveLength(3);
    tick(1_000);
    ws.receive(line("tard", "!b x"));
    expect(lines).toHaveLength(4);
  });

  it("coupure : reprise avec un delai qui double, remis a zero a la bienvenue", () => {
    const { statuses } = reader();
    FakeWs.all[0].close();
    expect(statuses.at(-1)).toBe("reconnexion");
    jest.advanceTimersByTime(1_000);
    expect(FakeWs.all).toHaveLength(2);
    FakeWs.all[1].close();
    jest.advanceTimersByTime(1_999);
    expect(FakeWs.all).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(FakeWs.all).toHaveLength(3);
    FakeWs.all[2].receive(":tmi.twitch.tv 001 x :Welcome");
    FakeWs.all[2].close();
    jest.advanceTimersByTime(1_000);
    expect(FakeWs.all).toHaveLength(4);
  });

  it("fermeture : plus de reprise", () => {
    const { r, statuses } = reader();
    r.close();
    jest.advanceTimersByTime(60_000);
    expect(FakeWs.all).toHaveLength(1);
    expect(FakeWs.all[0].closed).toBe(true);
    expect(statuses.at(-1)).toBe("ferme");
  });
});
