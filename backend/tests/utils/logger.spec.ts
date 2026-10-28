// Caviardage du logger par nom de cle (relecture de #82, M2) : tout `*_token`,
// `*Token` doit etre masque, pas seulement la cle « token ». Les valeurs sont
// courtes expres : la regle des 60 caracteres ne les masquerait pas, seule la
// regle par nom le fait (un jeton Discord fait une trentaine de caracteres).
import { Writable } from "stream";
import winston from "winston";
import { logger } from "../../src/utils/logger";

function capture(): { lines: string[]; transport: winston.transport } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { lines, transport: new winston.transports.Stream({ stream }) };
}

describe("logger : caviardage par nom de cle", () => {
  it.each([
    ["token"],
    ["accessToken"],
    ["access_token"],
    ["refreshToken"],
    ["refresh_token"],
    ["sessionToken"],
    ["id_token"],
  ])("masque %s, au premier niveau et imbrique", async cle => {
    const { lines, transport } = capture();
    logger.add(transport);
    logger.info("essai", { [cle]: "jeton-court-1", nested: { [cle]: "jeton-court-2" } });
    logger.remove(transport);

    const sortie = lines.join("");
    expect(sortie).toContain("essai");
    expect(sortie).not.toContain("jeton-court-1");
    expect(sortie).not.toContain("jeton-court-2");
  });

  it("laisse passer ce qui n'est pas un jeton", () => {
    const { lines, transport } = capture();
    logger.add(transport);
    logger.info("essai", { tokenCount: 3, playlistId: "abc", userId: 7 });
    logger.remove(transport);

    const sortie = lines.join("");
    expect(sortie).toContain('"tokenCount":3');
    expect(sortie).toContain('"playlistId":"abc"');
  });
});
