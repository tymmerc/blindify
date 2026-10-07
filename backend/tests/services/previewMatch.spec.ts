// Choix de l'extrait Deezer d'un morceau venu d'ailleurs (Spotify). Le 05/10/2026,
// Tym a entendu le mauvais extrait de "You Say Run" (Yuki Hayashi, OST de My
// Hero Academia) : la recherche avait garde "You Say Run (Earth-2021)", un
// reenregistrement de 2021, car les mentions entre parentheses etaient
// ignorees. Regle : jamais un autre morceau, et maintenant jamais une autre
// version.
import { parseTitle, pickMatch, isIsrc } from "../../src/services/previewMatch";

type Item = { id: number; title: string; artist: { name: string }; preview: string; duration: number };
const item = (id: number, title: string, duration: number, artist = "Yuki Hayashi", preview = `https://cdn.example/${id}.mp3`): Item =>
  ({ id, title, artist: { name: artist }, preview, duration });

// Les 10 premiers resultats reels de Deezer pour "You Say Run Yuki Hayashi"
// (requete du 07/10/2026) : la version originale de l'OST n'y est pas.
const YOU_SAY_RUN_SEARCH: Item[] = [
  item(1265507122, "You Say Run (Earth-2021)", 142),
  item(2078735677, "You Say Run＜My Hero Academia＞", 237),
  item(4288303012, "You Say Run - 10th Anniversary Version (feat. Electric Callboy) (from My Hero Academia: The Final Season)", 231),
  item(1059340662, "You Say Run (Re-build) [feat. Takahiro Obata]", 269),
  item(3031128191, "You Say Run -Succession-", 637),
  item(3031128091, "Quintuble", 166),
  item(3938846461, "Kindly... dude", 155),
  item(2923636671, "The Trinity", 138),
  item(1575679292, "ハイキュー!!", 233),
  item(1459584212, "Lonely Night", 151),
];

describe("parseTitle", () => {
  it("separe le titre de ses mentions de version", () => {
    expect(parseTitle("You Say Run (Earth-2021)")).toEqual({ base: "you say run", qualifiers: ["earth 2021"] });
    expect(parseTitle("You Say Run -Succession-")).toEqual({ base: "you say run", qualifiers: ["succession"] });
    expect(parseTitle("You Say Run (Re-build) [feat. Takahiro Obata]")).toEqual({ base: "you say run", qualifiers: ["re build"] });
    expect(parseTitle("Song - Live at Wembley / 1986")).toEqual({ base: "song", qualifiers: ["1986", "live at wembley"] });
  });

  it("ignore les mentions qui ne changent pas l'enregistrement", () => {
    for (const t of [
      "Bohemian Rhapsody - Remastered 2011",
      "Bohemian Rhapsody (2011 Remaster)",
      "Bohemian Rhapsody (Remasterisé 2020)",
      "Bohemian Rhapsody (feat. Someone)",
      "Bohemian Rhapsody [with Someone]",
      "Bohemian Rhapsody - From \"Wayne's World\"",
      "Bohemian Rhapsody - Single Version",
      "Bohemian Rhapsody (Radio Edit)",
      "Bohemian Rhapsody - Mono",
      "Bohemian Rhapsody (Prod. by Someone)",
      "Bohemian Rhapsody (Bonus Track)",
      "Bohemian Rhapsody (Original Motion Picture Soundtrack)",
      "Bohemian Rhapsody (Explicit Version)",
    ]) {
      expect(parseTitle(t)).toEqual({ base: "bohemian rhapsody", qualifiers: [] });
    }
  });
});

it("compare aussi les titres japonais et pleine chasse", () => {
  expect(parseTitle("\u30CF\u30A4\u30AD\u30E5\u30FC!!").base).not.toBe("");
  expect(parseTitle("\uFF39\uFF4F\uFF55 Say Run").base).toBe("you say run");
});

describe("pickMatch, version par version", () => {
  it("You Say Run : sans la version originale dans les resultats, aucun extrait (surtout pas Earth-2021)", () => {
    const got = pickMatch(YOU_SAY_RUN_SEARCH, { title: "You Say Run", artist: "Yuki Hayashi", durationMs: 228746 });
    expect(got).toBeNull();
  });

  it("You Say Run : meme sans duree connue, aucune autre version", () => {
    const got = pickMatch(YOU_SAY_RUN_SEARCH, { title: "You Say Run", artist: "Yuki Hayashi" });
    expect(got).toBeNull();
  });

  it("You Say Run : la version originale gagne des qu'elle est dans les resultats", () => {
    const original = item(3758443092, "You Say Run", 228);
    const got = pickMatch([...YOU_SAY_RUN_SEARCH, original], { title: "You Say Run", artist: "Yuki Hayashi", durationMs: 228746 });
    expect(got?.id).toBe(3758443092);
  });

  it("garde une version quand la source porte la meme mention", () => {
    const got = pickMatch(YOU_SAY_RUN_SEARCH, { title: "You Say Run - Earth-2021", artist: "Yuki Hayashi", durationMs: 142000 });
    expect(got?.id).toBe(1265507122);
  });

  it("refuse la version studio quand la source est un live", () => {
    const got = pickMatch([item(1, "Song", 200, "A")], { title: "Song - Live", artist: "A" });
    expect(got).toBeNull();
  });

  it("refuse remix, acoustique, sped up, karaoke, Taylor's Version...", () => {
    const items = [
      item(1, "Song (Remix)", 200, "A"), item(2, "Song - Acoustic", 200, "A"), item(3, "Song (Sped Up)", 200, "A"),
      item(4, "Song [Karaoke Version]", 200, "A"), item(5, "Song (Taylor's Version)", 200, "A"), item(6, "Song (Live)", 200, "A"),
      item(7, "Song (Instrumental)", 200, "A"), item(8, "Song - 2021", 200, "A"), item(9, "Song (10th Anniversary Edition)", 200, "A"),
    ];
    expect(pickMatch(items, { title: "Song", artist: "A" })).toBeNull();
  });

  it("accepte la meme version ecrite autrement (remaster, featuring)", () => {
    const got = pickMatch([item(5, "Bohemian Rhapsody (Remastered 2011)", 355, "Queen")], { title: "Bohemian Rhapsody - 2011 Remaster", artist: "Queen", durationMs: 354320 });
    expect(got?.id).toBe(5);
  });

  it("departage par la duree la plus proche", () => {
    const items = [item(1, "Song", 260, "A"), item(2, "Song", 201, "A"), item(3, "Song", 206, "A")];
    expect(pickMatch(items, { title: "Song", artist: "A", durationMs: 200500 })?.id).toBe(2);
  });

  it("refuse un titre identique dont la duree s'ecarte trop (autre enregistrement)", () => {
    // Tolerance : 8 s ou 5 %, la plus grande. 200 s -> 10 s.
    expect(pickMatch([item(1, "Song", 211, "A")], { title: "Song", artist: "A", durationMs: 200000 })).toBeNull();
    expect(pickMatch([item(1, "Song", 209, "A")], { title: "Song", artist: "A", durationMs: 200000 })?.id).toBe(1);
  });

  it("prefere un candidat avec extrait a un candidat sans extrait", () => {
    const items = [item(1, "Song", 200, "A", ""), item(2, "Song", 205, "A")];
    expect(pickMatch(items, { title: "Song", artist: "A", durationMs: 200000 })?.id).toBe(2);
  });
});

// Deezer ecrit souvent l'artiste dans son ecriture d'origine (kanji, kana,
// cyrillique) quand Spotify le romanise : "Yuki Hayashi" / "\u6797\u3000\u3086\u3046\u304D".
describe("pickMatch, artistes dans une autre ecriture", () => {
  const KANJI = "\u6797\u3000\u3086\u3046\u304D"; // Hayashi Yuki
  const UTADA = "\u5B87\u591A\u7530\u30D2\u30AB\u30EB"; // Utada Hikaru

  it("accepte le bon titre a 3 s pres quand l'artiste n'est pas comparable", () => {
    const got = pickMatch([item(3758443092, "You Say Run", 228, KANJI)], { title: "You Say Run", artist: "Yuki Hayashi", durationMs: 228746 });
    expect(got?.id).toBe(3758443092);
    expect(pickMatch([item(7, "First Love", 257, UTADA)], { title: "First Love", artist: "Hikaru Utada", durationMs: 257000 })?.id).toBe(7);
  });

  it("refuse si la duree s'ecarte de plus de 3 s, ou si elle est inconnue", () => {
    expect(pickMatch([item(1, "You Say Run", 233, KANJI)], { title: "You Say Run", artist: "Yuki Hayashi", durationMs: 228746 })).toBeNull();
    expect(pickMatch([item(1, "You Say Run", 228, KANJI)], { title: "You Say Run", artist: "Yuki Hayashi" })).toBeNull();
  });

  it("Earth-2021 reste refuse, meme avec l'artiste en kanji", () => {
    const kanjiSearch = YOU_SAY_RUN_SEARCH.map(i => ({ ...i, artist: { name: KANJI } }));
    expect(pickMatch(kanjiSearch, { title: "You Say Run", artist: "Yuki Hayashi", durationMs: 228746 })).toBeNull();
  });

  it("un artiste cyrillique n'accepte plus n'importe quel artiste", () => {
    const cover = item(1, "\u0413\u0440\u0443\u043F\u043F\u0430 \u043A\u0440\u043E\u0432\u0438", 200, "Cover Band");
    expect(pickMatch([cover], { title: "\u0413\u0440\u0443\u043F\u043F\u0430 \u043A\u0440\u043E\u0432\u0438", artist: "\u041A\u0438\u043D\u043E", durationMs: 285000 })).toBeNull();
  });

  it("meme ecriture : l'artiste doit correspondre, comme avant", () => {
    expect(pickMatch([item(1, "Song", 200, "Someone Else")], { title: "Song", artist: "A Band", durationMs: 200000 })).toBeNull();
  });

  it("titres en hangul ou en cyrillique : jamais une base vide", () => {
    expect(parseTitle("\uBD04\uB0A0").base).not.toBe("");
    expect(parseTitle("\u0413\u0440\u0443\u043F\u043F\u0430 \u043A\u0440\u043E\u0432\u0438").base).toBe("\u0433\u0440\u0443\u043F\u043F\u0430 \u043A\u0440\u043E\u0432\u0438");
  });

  it("une duree inconnue passe apres une duree proche", () => {
    const items = [item(1, "Song", 0, "A"), item(2, "Song", 201, "A")];
    expect(pickMatch(items, { title: "Song", artist: "A", durationMs: 200000 })?.id).toBe(2);
  });
});

describe("isIsrc", () => {
  it("reconnait un ISRC et refuse le reste", () => {
    expect(isIsrc("JPZ921607277")).toBe(true);
    expect(isIsrc("usrc17607839")).toBe(true);
    expect(isIsrc("JPZ92160727")).toBe(false);
    expect(isIsrc("../track/1")).toBe(false);
    expect(isIsrc(undefined)).toBe(false);
    expect(isIsrc(42)).toBe(false);
  });
});
