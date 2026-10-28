// T15 (17/10/2026) : la connexion au compte Spotify (OAuth utilisateur) est
// retiree. Reste l'import par lien colle, avec le jeton client de l'appli.
// Ces tests gardent la surface fermee : aucune route OAuth, aucun appel a
// l'API du compte connecte (/v1/me), plus de client OAuth dans le code.
import fs from "fs";
import path from "path";
import type { AddressInfo } from "net";
import type { Server } from "http";
import express from "express";

jest.mock("../../src/config/db", () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));

import authRoutes from "../../src/routes/auth";

const SRC = path.join(__dirname, "..", "..", "src");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|js)$/.test(entry.name) ? [full] : [];
  });
}

function appWithAuthRoutes(): express.Express {
  const app = express();
  app.use(express.json());
  // Meme montage que src/index.ts, et meme 404 final.
  app.use("/auth", authRoutes);
  app.use("/api/auth", authRoutes);
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: "not_found" } });
  });
  return app;
}

describe("routes OAuth Spotify retirees", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = appWithAuthRoutes().listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  const routes: Array<["GET" | "POST", string]> = [
    ["GET", "/api/auth/spotify"],
    // Adresse encore relayee par nginx avant T15 (13-blindz.conf, 10-main.conf).
    ["GET", "/auth/spotify/login"],
    ["GET", "/api/auth/login"],
    ["GET", "/api/auth/callback"],
    ["GET", "/auth/callback"],
    ["GET", "/api/auth/spotify/callback"],
    ["POST", "/api/auth/refresh"],
    ["POST", "/api/auth/spotify/refresh"],
    ["POST", "/api/auth/spotify/disconnect"],
    ["POST", "/api/auth/disconnect"],
  ];

  it.each(routes)("%s %s repond 404", async (method, url) => {
    const reply = await fetch(`${base}${url}?code=x&state=y`, { method, redirect: "manual" });
    expect(reply.status).toBe(404);
  });
});

describe("code du compte Spotify connecte retire", () => {
  const files = sourceFiles(SRC);

  it.each([
    ["l'API du compte connecte", /api\.spotify\.com\/v1\/me\b/],
    ["le client OAuth spotify-web-api-node", /spotify-web-api-node/],
    ["le rafraichissement d'un jeton utilisateur", /refreshAccessToken|grant_type["']?\s*[:=,]\s*["']refresh_token/],
    ["l'adresse de retour OAuth", /SPOTIFY_REDIRECT_URI/],
    ["l'etat OAuth en session", /oauthState/],
  ])("aucun fichier de src n'utilise %s", (_label, pattern) => {
    const hits = files.filter(file => pattern.test(fs.readFileSync(file, "utf8")));
    expect(hits.map(file => path.relative(SRC, file))).toEqual([]);
  });

  it("seule la suppression de compte touche encore user_connections", () => {
    const hits = files
      .filter(file => /user_connections/.test(fs.readFileSync(file, "utf8")))
      .map(file => path.relative(SRC, file));
    expect(hits).toEqual([path.join("controllers", "authController.ts")]);
  });

  it("package.json ne depend plus de spotify-web-api-node", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(SRC, "..", "package.json"), "utf8"));
    expect(pkg.dependencies?.["spotify-web-api-node"]).toBeUndefined();
    expect(pkg.devDependencies?.["spotify-web-api-node"]).toBeUndefined();
  });
});
