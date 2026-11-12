// Du titre d'une video YouTube aux recherches Deezer. Les cas viennent de
// vraies playlists publiques relevees le 08/11/2026 (rap FR, pop, quebecois,
// annees 80) : 80 morceaux retrouves sur 90 avec ce nettoyage.
import { describe, expect, it } from "@jest/globals";
import { channelArtist, stripNoise, youtubeSearches } from "../../src/services/youtubeTitle";

describe("stripNoise", () => {
  it.each([
    ["IAM - Demain c'est loin (Clip officiel)", "IAM - Demain c'est loin"],
    ["Oxmo Puccino - L'enfant seul [Official Music Video]", "Oxmo Puccino - L'enfant seul"],
    ["Iam - Petit Frère (Clip Officiel) [HD]", "Iam - Petit Frère"],
    ["La Rvfleuze - Argent Sale | A COLORS SHOW", "La Rvfleuze - Argent Sale"],
    ["SDM - CARTIER SANTOS (Visualizer Officiel)", "SDM - CARTIER SANTOS"],
    ["a-ha - Take On Me (Official Video) [4K]", "a-ha - Take On Me"],
    ["Phil Collins - In The Air Tonight (Official Music Video) [HD Upgrade]", "Phil Collins - In The Air Tonight"],
    ["Billie Eilish - BIRDS OF A FEATHER (Official Lyric Video)", "Billie Eilish - BIRDS OF A FEATHER"],
    ["Justin Bieber - DAISIES (Audio)", "Justin Bieber - DAISIES"],
    ["Les Colocs - La Rue Principale (clip 1993)", "Les Colocs - La Rue Principale"],
    ["Richard Séguin - Double vie (1985)", "Richard Séguin - Double vie"],
    ["Michel Pagliaro-''J'entends Frapper'' (1972).wmv", "Michel Pagliaro-''J'entends Frapper''"],
    ["Début de Soiree - Nuit de Folie - Clip Officiel", "Début de Soiree - Nuit de Folie"],
    ['Lunatic - "Pas l\'Temps Pour Les Regrets" clip officiel', 'Lunatic - "Pas l\'Temps Pour Les Regrets"'],
    ["Vanessa Paradis - Joe Le Taxi (Clip Officiel remasterisé)", "Vanessa Paradis - Joe Le Taxi"],
    ["Mes Aïeux - Dégénérations (Vidéoclip officiel)", "Mes Aïeux - Dégénérations"],
    ["Artiste - Titre (Paroles) #rapfr 🔥", "Artiste - Titre"],
  ])("%s", (raw, expected) => {
    expect(stripNoise(raw)).toBe(expected);
  });

  it("garde les mentions de version : elles changent l'enregistrement", () => {
    expect(stripNoise("Artiste - Titre (Live)")).toBe("Artiste - Titre (Live)");
    expect(stripNoise("Artiste - Titre (Acoustic Video)")).toBe("Artiste - Titre (Acoustic Video)");
    expect(stripNoise("Whitney Houston - I Wanna Dance With Somebody (Who Loves Me) (Official 4K Video)"))
      .toBe("Whitney Houston - I Wanna Dance With Somebody (Who Loves Me)");
    expect(stripNoise("PHIFI1 - La concierge (99 BPM Version) [Official Video]")).toBe("PHIFI1 - La concierge (99 BPM Version)");
  });

  it("ne coupe pas un titre qui finit par un mot ordinaire", () => {
    expect(stripNoise("Madonna - Like A Prayer")).toBe("Madonna - Like A Prayer");
    expect(stripNoise("Clip")).toBe("Clip");
  });

  it("retire les caracteres invisibles et l'arobase des pseudos", () => {
    expect(stripNoise("⁨ UZI - 50G feat @jksnofficiel")).toBe("UZI - 50G feat jksnofficiel");
  });
});

describe("channelArtist", () => {
  it.each([
    ["Okoumé - Topic", { name: "Okoumé", official: true }],
    ["NTMVEVO", { name: "NTM", official: true }],
    ["ArianaGrandeVevo", { name: "ArianaGrande", official: true }],
    ["IAM Officiel", { name: "IAM", official: true }],
    ["Queen Official", { name: "Queen", official: true }],
    ["metaleuse80", { name: "metaleuse80", official: false }],
  ])("%s", (raw, expected) => {
    expect(channelArtist(raw)).toEqual(expected);
  });

  it("chaine absente : rien", () => {
    expect(channelArtist(null)).toBeNull();
    expect(channelArtist("  ")).toBeNull();
  });
});

describe("youtubeSearches", () => {
  it("Artiste - Titre confirme par la chaine : une seule recherche", () => {
    expect(youtubeSearches("IAM - Demain c'est loin (Clip officiel)", "IAM Officiel"))
      .toEqual([{ title: "Demain c'est loin", artist: "IAM" }]);
  });

  it("chaine qui ne dit rien : dans l'ordre, puis a l'envers", () => {
    expect(youtubeSearches("Trois nuits par semaine - Indochine", "metaleuse80")).toEqual([
      { title: "Indochine", artist: "Trois nuits par semaine" },
      { title: "Trois nuits par semaine", artist: "Indochine" },
    ]);
  });

  it("chaine de l'artiste a droite du tiret : on inverse sans second essai", () => {
    expect(youtubeSearches("Voyage Voyage - Desireless", "Desireless")).toEqual([{ title: "Voyage Voyage", artist: "Desireless" }]);
  });

  it("chaine automatique YouTube Music : titre exact, artiste de la chaine", () => {
    expect(youtubeSearches("Dis-moi pas ça", "Okoumé - Topic")).toEqual([{ title: "Dis-moi pas ça", artist: "Okoumé" }]);
  });

  it("titre seul et chaine d'un particulier : la chaine, puis sans artiste", () => {
    expect(youtubeSearches("j'ai encoré rêvé d'elle", "luxurette")).toEqual([
      { title: "j'ai encoré rêvé d'elle", artist: "luxurette" },
      { title: "j'ai encoré rêvé d'elle" },
    ]);
  });

  it("le featuring sort du titre et de l'artiste", () => {
    expect(youtubeSearches("Tiakola - Manon B feat. Ryflo, Oskoow & MC Cebezinho (Clip officiel)", "TIAKOLA")[0])
      .toEqual({ title: "Manon B", artist: "Tiakola" });
    expect(youtubeSearches("Oxmo Puccino feat Lunatic (Booba) - Pucc fiction", "GSRDone")[0])
      .toEqual({ title: "Pucc fiction", artist: "Oxmo Puccino" });
  });

  it("premier artiste seulement ; un nom colle avec & reste entier", () => {
    expect(youtubeSearches("CENTRAL CEE X JRK 19 - BOLIDE NOIR (MUSIC VIDEO)", "Central Cee")[0])
      .toEqual({ title: "BOLIDE NOIR", artist: "CENTRAL CEE" });
    expect(youtubeSearches("Lady Gaga, Bruno Mars - Die With A Smile (Official Music Video)", "LadyGagaVEVO")[0])
      .toEqual({ title: "Die With A Smile", artist: "Lady Gaga" });
    expect(youtubeSearches("Bello&Dallas - Belvedere (Clip Officiel)", "Bello&Dallas")[0])
      .toEqual({ title: "Belvedere", artist: "Bello&Dallas" });
  });

  it("ce qui suit le tiret n'est que du bruit : c'est un titre seul", () => {
    expect(youtubeSearches("Embarque ma belle - vidéoclip", "miaog9")).toEqual([
      { title: "Embarque ma belle", artist: "miaog9" },
      { title: "Embarque ma belle" },
    ]);
  });

  it("guillemets et extension de fichier retires", () => {
    expect(youtubeSearches("Michel Pagliaro-''J'entends Frapper'' (1972).wmv", "Phil7462")[0])
      .toEqual({ title: "J'entends Frapper", artist: "Michel Pagliaro" });
  });

  it("titre vide ou que du bruit : aucune recherche", () => {
    expect(youtubeSearches("", "X")).toEqual([]);
    expect(youtubeSearches("(Official Video) [HD]", "X")).toEqual([]);
  });

  it("jamais plus de deux recherches", () => {
    for (const title of ["A - B", "Titre seul", "A - B - C", "X x Y - Z (Live)"]) {
      expect(youtubeSearches(title, "chaine").length).toBeLessThanOrEqual(2);
    }
  });
});
