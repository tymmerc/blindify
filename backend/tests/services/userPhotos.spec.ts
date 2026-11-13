/**
 * T39 : ce qui arrive comme photo de profil est verifie et refait cote serveur.
 * Sans base : seulement la lecture du format et le traitement par sharp.
 */
import sharp from "sharp";
import {
  PHOTO_SIZE_PX,
  PHOTO_UPLOAD_MAX_BYTES,
  PhotoError,
  detectImageType,
  parsePhotoFile,
  processPhoto,
} from "../../src/services/userPhotos";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 198, g: 81, b: 51 } } });

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof PhotoError ? err.code : "autre";
  }
}

describe("detectImageType", () => {
  it("reconnait JPEG, PNG et WebP a leurs premiers octets", async () => {
    expect(detectImageType(await solid(4, 4).jpeg().toBuffer())).toBe("jpeg");
    expect(detectImageType(await solid(4, 4).png().toBuffer())).toBe("png");
    expect(detectImageType(await solid(4, 4).webp().toBuffer())).toBe("webp");
  });

  it("refuse le reste, meme vide ou tronque", async () => {
    expect(detectImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageType(await solid(4, 4).gif().toBuffer())).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(Buffer.from("RIFF0000WAVE"))).toBeNull();
  });
});

describe("processPhoto", () => {
  it("recadre en carre de 256 px, en WebP", async () => {
    const out = await processPhoto(await solid(1200, 800).jpeg().toBuffer());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(PHOTO_SIZE_PX);
    expect(meta.height).toBe(PHOTO_SIZE_PX);
  });

  it("retire EXIF et position GPS, en appliquant d'abord l'orientation", async () => {
    // Photo en paysage marquee « tourner de 90° » : elle doit sortir debout.
    const input = await solid(600, 300)
      .withExif({ IFD0: { Make: "Telephone", Orientation: "6" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "41/1 55/1 0/1" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await processPhoto(input);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(out.includes(Buffer.from("Telephone"))).toBe(false);
  });

  it("refuse un fichier qui n'est pas une image, quel que soit son nom", async () => {
    expect(await codeOf(processPhoto(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><image href='http://x'/></svg>")))).toBe("not_an_image");
    expect(await codeOf(processPhoto(await solid(10, 10).gif().toBuffer()))).toBe("not_an_image");
  });

  it("refuse un faux en-tete JPEG suivi de n'importe quoi", async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("pas une image du tout")]);
    expect(await codeOf(processPhoto(fake))).toBe("image_unreadable");
  });

  it("refuse un en-tete PNG devant un JPEG (format annonce different du contenu)", async () => {
    const jpeg = await solid(10, 10).jpeg().toBuffer();
    const disguised = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), jpeg]);
    expect(await codeOf(processPhoto(disguised))).not.toBeNull();
  });

  it("refuse au-dela de la taille d'envoi sans decoder", async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(PHOTO_UPLOAD_MAX_BYTES)]);
    expect(await codeOf(processPhoto(big))).toBe("image_too_large");
  });
});

describe("parsePhotoFile", () => {
  it("ne lit qu'un uuid suivi de .webp", () => {
    expect(parsePhotoFile("0f8fad5b-d9cb-469f-a165-70867728950e.webp")).toBe("0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(parsePhotoFile("0f8fad5b-d9cb-469f-a165-70867728950e.png")).toBeNull();
    expect(parsePhotoFile("../../etc/passwd")).toBeNull();
    expect(parsePhotoFile("0f8fad5b-d9cb-469f-a165-70867728950e.webp.webp")).toBeNull();
    expect(parsePhotoFile("--------------------------------------.webp")).toBeNull();
  });
});
