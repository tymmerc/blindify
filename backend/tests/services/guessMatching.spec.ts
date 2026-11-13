import { evaluateGuessDetail } from "../../src/services/guessMatching";

// Partie 784 du 07/11/2026 : « nothing news » refuse pour « Nothing's New ».
// normalize() coupait le mot a l'apostrophe et le « s » isole ne retrouvait
// aucun mot tape. Les reponses sans apostrophe doivent passer comme les autres.

const NOTHINGS_NEW = { title: "Nothing's New", artist: "Rio Romeo" };
const DONT_STOP = { title: "Don't Stop Me Now", artist: "Queen" };
const LAMOUR = { title: "L'amour", artist: "Odezenne" };
const LETE = { title: "L'été", artist: "Artiste" };

/** Champ titre seul, comme le site, l'Activite Discord et le chat Twitch. */
function titleField(title: string, track: { title: string; artist: string }): boolean {
  return evaluateGuessDetail("", track, title, "").matchedTitle;
}

/** Ancien chemin : une seule saisie, sans champs separes. */
function combined(guess: string, track: { title: string; artist: string }): boolean {
  return evaluateGuessDetail(guess, track).matchedTitle;
}

describe("guessMatching : titres a apostrophe", () => {
  describe.each([
    ["champ titre", titleField],
    ["saisie unique", combined],
  ])("%s", (_label, matches) => {
    it.each(["nothing news", "nothing new", "nothings new", "Nothing's New", "nothing’s new", "NOTHING NEW"])(
      "« %s » valide « Nothing's New »",
      guess => {
        expect(matches(guess, NOTHINGS_NEW)).toBe(true);
      },
    );

    it.each(["dont stop me now", "don't stop me now", "Don’t Stop Me Now", "dont stop me nw"])(
      "« %s » valide « Don't Stop Me Now »",
      guess => {
        expect(matches(guess, DONT_STOP)).toBe(true);
      },
    );

    it.each(["lamour", "l amour", "amour", "l'amour", "l’amour"])("« %s » valide « L'amour »", guess => {
      expect(matches(guess, LAMOUR)).toBe(true);
    });

    it("l'apostrophe typographique du titre est traitee comme l'autre", () => {
      expect(matches("nothing news", { title: "Nothing’s New", artist: "Rio Romeo" })).toBe(true);
      expect(matches("dont stop me now", { title: "Don`t Stop Me Now", artist: "Queen" })).toBe(true);
    });

    describe("non-regressions", () => {
      it.each(["nothing else", "nothing", "new", "news", "something new", "everything new"])(
        "« %s » reste faux pour « Nothing's New »",
        guess => {
          expect(matches(guess, NOTHINGS_NEW)).toBe(false);
        },
      );

      it.each(["stop me now", "dont stop", "do stop me now", "dont start me now"])(
        "« %s » reste faux pour « Don't Stop Me Now »",
        guess => {
          expect(matches(guess, DONT_STOP)).toBe(false);
        },
      );

      it.each(["l", "toujours", "la mer", "lumiere"])("« %s » reste faux pour « L'amour »", guess => {
        expect(matches(guess, LAMOUR)).toBe(false);
      });

      it("un mot court colle garde la tolerance d'un mot court (1 faute)", () => {
        expect(matches("lete", LETE)).toBe(true);
        expect(matches("ete", LETE)).toBe(true);
        expect(matches("lait", LETE)).toBe(false);
        expect(matches("lot", LETE)).toBe(false);
      });

      it("les titres a apostrophe interne acceptent encore les morceaux separes", () => {
        const track = { title: "Rock'n'Roll", artist: "Artiste" };
        expect(matches("rock n roll", track)).toBe(true);
        expect(matches("rock'n'roll", track)).toBe(true);
        expect(matches("rocknroll", track)).toBe(true);
      });

      it("un titre sans apostrophe ne change pas", () => {
        const track = { title: "Chocolat (feat. Awa Imani)", artist: "Naza" };
        expect(matches("chocolat", track)).toBe(true);
        expect(matches("chocolate", track)).toBe(true);
        expect(matches("chocolat's", track)).toBe(true);
        expect(matches("caramel", track)).toBe(false);
      });
    });
  });

  it("titre et artiste a apostrophe : verdict correct sans apostrophe", () => {
    const track = { title: "I'm Yours", artist: "Guns N' Roses" };
    expect(evaluateGuessDetail("", track, "im yours", "guns n roses").verdict).toBe("correct");
    expect(evaluateGuessDetail("im yours guns n roses", track).verdict).toBe("correct");
    expect(evaluateGuessDetail("", track, "im yours", "metallica").verdict).toBe("close");
  });

  it("champs croises conserves : l'artiste tape dans le champ titre", () => {
    expect(evaluateGuessDetail("", NOTHINGS_NEW, "rio romeo", "nothing news").verdict).toBe("correct");
  });

  it("une saisie vide ou en ponctuation ne valide rien", () => {
    expect(evaluateGuessDetail("", NOTHINGS_NEW, "", "").verdict).toBe("wrong");
    expect(evaluateGuessDetail("'''", NOTHINGS_NEW).verdict).toBe("wrong");
    expect(evaluateGuessDetail("", NOTHINGS_NEW, "'", "").verdict).toBe("wrong");
  });
});

// T36, soiree du 12/11/2026 (parties 817 a 823) : bonnes reponses refusees.
// Chaque regle a ses cas reels qui doivent passer et des cas qui doivent
// rester refuses.

/** Champ artiste seul. */
function artistField(artist: string, track: { title: string; artist: string }): boolean {
  return evaluateGuessDetail("", track, "", artist).matchedArtist;
}

const track = (title: string, artist = "Artiste") => ({ title, artist });

describe("guessMatching T36 : espaces", () => {
  it.each([
    ["Bubblegum", "Bubble Gum"],
    ["danidana", "Dana Dana (ft. Rima)"],
    ["bubble gum", "Bubblegum"],
    ["jet ski", "Jetski"],
  ])("« %s » valide « %s »", (guess, title) => {
    expect(titleField(guess, track(title))).toBe(true);
  });

  it("« Karolg » valide l'artiste « KAROL G »", () => {
    expect(artistField("Karolg", track("BbY WOW", "KAROL G"))).toBe(true);
  });

  it.each([
    ["bad bi", "Baby"],
    ["I love you", "I Love You So"],
    ["iloveyou", "I Love You So"],
    ["sauf my name", "Say My Name"],
  ])("« %s » reste faux pour « %s »", (guess, title) => {
    expect(titleField(guess, track(title))).toBe(false);
  });
});

describe("guessMatching T36 : article en tete de titre", () => {
  it.each([
    ["Kill 2", "the kill 2"],
    ["Sky full off stars", "A Sky Full of Stars"],
    ["grenade", "La grenade"],
    ["danse", "Une danse"],
  ])("« %s » valide « %s »", (guess, title) => {
    expect(titleField(guess, track(title))).toBe(true);
  });

  it.each([
    ["rock that body", "The Rock"],
    ["kill", "the kill 2"],
    ["Le temps est beau", "Le temps est bon"],
    ["Sky", "A Sky Full of Stars"],
  ])("« %s » reste faux pour « %s »", (guess, title) => {
    expect(titleField(guess, track(title))).toBe(false);
  });
});

describe("guessMatching T36 : mashups « A x B »", () => {
  it.each([
    ["Carnival", "Carnival x Fein"],
    ["Fein", "Carnival x Fein"],
    ["Sweather weather", "sweater weather x another love"],
    ["another love", "sweater weather x another love"],
  ])("« %s » valide « %s »", (guess, title) => {
    expect(titleField(guess, track(title))).toBe(true);
  });

  it.each([
    ["love", "sweater weather x another love"],
    ["another", "sweater weather x another love"],
  ])("« %s » reste faux pour « %s »", (guess, title) => {
    expect(titleField(guess, track(title))).toBe(false);
  });
});

describe("guessMatching T36 : le coeur du titre (fin du titre)", () => {
  it.each([
    ["Formidable", "For Me... Formidable"],
    ["Les yeux d’emilie", "Dans les yeux d'Émilie"],
    ["les yeux demilie", "Dans les yeux d'Émilie"],
    ["Break free", "I Want To Break Free"],
    ["I want a break free", "I Want To Break Free"],
    ["Ophelia", "The Fate of Ophelia"],
    ["ophelie", "The Fate of Ophelia"],
    ["sushi restaurant", "Music For a Sushi Restaurant"],
  ])("« %s » valide « %s »", (guess, title) => {
    expect(titleField(guess, track(title))).toBe(true);
  });

  it.each([
    ["I love you", "I Love You So"],
    ["Ti amo", "Sarà perché ti amo"],
    ["Love song", "Love You Like A Love Song"],
    ["Émilie", "Dans les yeux d'Émilie"],
    ["free", "I Want To Break Free"],
    ["restaurant", "Music For a Sushi Restaurant"],
    ["tonight", "Save Me Tonight"],
    ["say my the night", "Save Me Tonight"],
    ["ophelai", "The Fate of Ophelia"],
    ["mix it", "In The Mix"],
    ["curse you off", "Cut You Off"],
    ["Mountain high enough", "Ain't No Mountain High Enough"],
  ])("« %s » reste faux pour « %s »", (guess, title) => {
    expect(titleField(guess, track(title))).toBe(false);
  });

  it("verdict correct avec l'artiste, en champs separes comme en saisie unique", () => {
    const ophelia = track("The Fate of Ophelia", "Taylor Swift");
    expect(evaluateGuessDetail("", ophelia, "Ophelia", "Taylor Swift").verdict).toBe("correct");
    expect(evaluateGuessDetail("ophelia taylor swift", ophelia).verdict).toBe("correct");
    expect(evaluateGuessDetail("", ophelia, "Ophelia", "").verdict).toBe("close");
  });
});

describe("guessMatching T36 : noms mal orthographies", () => {
  it.each([
    ["Jhon denver", "John Denver"],
    ["fujikaze", "Fujii Kaze"],
  ])("« %s » valide « %s »", (guess, artist) => {
    expect(artistField(guess, track("Titre", artist))).toBe(true);
  });

  // Deux fautes ET une lettre d'ecart : accepter « Tate Mac ray » ferait aussi
  // passer « sauf my name » pour « Say My Name ». Laisse refuse expres.
  it.each([
    ["Tate Mac ray", "Tate McRae"],
    ["Enimen", "Eminem"],
    ["Tate", "Tate McRae"],
    ["Kate Mc", "Tate McRae"],
  ])("« %s » reste faux pour « %s »", (guess, artist) => {
    expect(artistField(guess, track("Titre", artist))).toBe(false);
  });
});
