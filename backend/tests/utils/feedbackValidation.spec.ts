// Validation du corps de POST /api/feedback, sans base : chaque champ est borne
// avant d'atteindre la requete SQL.
import { MAX_FEEDBACK_MESSAGE, parseFeedback } from "../../src/utils/feedbackValidation";

const avis = { kind: "avis", answer: "oui", mode: "solo" };
const bug = { kind: "bug", mode: "friends", message: "Le son a coupé à la manche 3" };

function refusal(body: unknown): string {
  const r = parseFeedback(body);
  if (r.ok) throw new Error("accepte a tort : " + JSON.stringify(body));
  return r.code;
}

describe("parseFeedback", () => {
  it("accepte un avis rapide minimal", () => {
    expect(parseFeedback(avis)).toEqual({
      ok: true,
      value: { kind: "avis", answer: "oui", message: null, mode: "solo", sessionId: null, gameCode: null, appVersion: null },
    });
  });

  it("accepte un bug avec texte, code de salle et version", () => {
    const r = parseFeedback({ ...bug, gameCode: "ab12cd", appVersion: "3f9c2e1", sessionId: 42 });
    expect(r).toEqual({
      ok: true,
      value: {
        kind: "bug", answer: null, message: "Le son a coupé à la manche 3", mode: "friends",
        sessionId: 42, gameCode: "AB12CD", appVersion: "3f9c2e1",
      },
    });
  });

  it("accepte un bug sans texte (le texte est facultatif)", () => {
    const r = parseFeedback({ kind: "bug", mode: "chrono", message: "   " });
    expect(r.ok && r.value.message).toBeNull();
  });

  it("refuse ce qui n'est pas un objet", () => {
    expect(refusal(null)).toBe("invalid_body");
    expect(refusal("oui")).toBe("invalid_body");
    expect(refusal([avis])).toBe("invalid_body");
  });

  it("refuse un type ou un mode inconnu", () => {
    expect(refusal({ ...avis, kind: "note" })).toBe("invalid_kind");
    expect(refusal({ ...avis, mode: "streamer" })).toBe("invalid_mode");
    expect(refusal({ ...avis, mode: undefined })).toBe("invalid_mode");
  });

  it("exige une reponse pour un avis et l'interdit pour un bug", () => {
    expect(refusal({ ...avis, answer: undefined })).toBe("invalid_answer");
    expect(refusal({ ...avis, answer: "peut-etre" })).toBe("invalid_answer");
    expect(refusal({ ...bug, answer: "oui" })).toBe("invalid_answer");
  });

  it("borne le message a 1000 caracteres", () => {
    const max = "a".repeat(MAX_FEEDBACK_MESSAGE);
    const r = parseFeedback({ ...bug, message: max });
    expect(r.ok && r.value.message).toBe(max);
    expect(refusal({ ...bug, message: max + "a" })).toBe("invalid_message");
    expect(refusal({ ...bug, message: 12 })).toBe("invalid_message");
  });

  it("retire les caracteres de controle, garde les sauts de ligne", () => {
    const r = parseFeedback({ ...bug, message: "ligne 1\r\nligne\u0000 2\u0007\tfin" });
    expect(r.ok && r.value.message).toBe("ligne 1\nligne 2\tfin");
  });

  it("retire les controles C1 et les caracteres invisibles sans chasse", () => {
    const r = parseFeedback({ ...bug, message: "a\u0085b\u009Fc\u200Bd\u2060e\uFEFFf" });
    expect(r.ok && r.value.message).toBe("abcdef");
  });

  it("retire les forcages du sens d'ecriture, qui feraient lire autre chose", () => {
    const inverse = "bug \u202Etxt.exe\u202C fin";
    const isole = "x\u2066y\u2067z\u2068w\u2069 \u200E\u200F\u061C\u202A\u202B\u202D.";
    expect(parseFeedback({ ...bug, message: inverse })).toMatchObject({ ok: true, value: { message: "bug txt.exe fin" } });
    expect(parseFeedback({ ...bug, message: isole })).toMatchObject({ ok: true, value: { message: "xyzw ." } });
  });

  it("garde le liant sans chasse des emojis composes", () => {
    const dev = "\u{1F469}\u200D\u{1F4BB} top";
    expect(parseFeedback({ ...bug, message: dev })).toMatchObject({ ok: true, value: { message: dev } });
  });

  it("ramene U+2028 et U+2029 a un saut de ligne, et pas plus d'une ligne vide d'affilee", () => {
    const r = parseFeedback({ ...bug, message: "un\u2028deux\u2029trois\n\n\n\n\nquatre  \n \n\t\n\ncinq" });
    expect(r.ok && r.value.message).toBe("un\ndeux\ntrois\n\nquatre\n\ncinq");
  });

  it("un message fait seulement de caracteres invisibles est un bug sans texte", () => {
    const r = parseFeedback({ ...bug, message: "\u200B\u202E\n\n\u2028" });
    expect(r.ok && r.value.message).toBeNull();
  });

  it("refuse un identifiant de partie qui n'est pas un entier positif", () => {
    for (const sessionId of [0, -3, 1.5, "12", 2 ** 31, Number.NaN]) {
      expect(refusal({ ...avis, sessionId })).toBe("invalid_session");
    }
  });

  it("refuse un code de partie hors format", () => {
    expect(refusal({ ...avis, gameCode: "AB CD" })).toBe("invalid_code");
    expect(refusal({ ...avis, gameCode: "x".repeat(17) })).toBe("invalid_code");
  });

  it("laisse tomber une version hors format au lieu de refuser le retour", () => {
    for (const appVersion of ["<script>", "a".repeat(41), "v1.2+build", 12, {}]) {
      expect(parseFeedback({ ...avis, appVersion })).toMatchObject({ ok: true, value: { kind: "avis", appVersion: null } });
    }
    expect(parseFeedback({ ...avis, appVersion: "v1.2.3-rc_1" })).toMatchObject({ ok: true, value: { appVersion: "v1.2.3-rc_1" } });
  });
});
