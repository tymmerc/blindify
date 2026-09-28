// Explorateur de base en LECTURE SEULE.
//
// Trois garde-fous empiles, parce qu'un seul ne suffit jamais :
//   1. la connexion utilise le role PostgreSQL `blindz_ro`, qui n'a que SELECT ;
//   2. chaque requete tourne dans une transaction READ ONLY ;
//   3. le texte est refuse s'il ne commence pas par SELECT ou WITH, ou s'il
//      contient plusieurs instructions.
// Le service n'ecoute que sur 127.0.0.1 : c'est nginx qui l'expose, derriere
// le meme mot de passe que le tableau de bord.

import http from "http"
import { execFileSync } from "child_process"
import fs from "fs"
import { createRequire } from "module"

const { Pool } = createRequire("/opt/blindify/backend/package.json")("pg")

const PORT = 3101
const MAX_LIGNES = 500
const DELAI_MS = 8000

const pool = new Pool({
  host: "127.0.0.1",
  port: 5432,
  user: "blindz_ro",
  password: fs.readFileSync("/root/.blindz-ro-pass", "utf8").trim(),
  database: "blindify",
  max: 4,
  idleTimeoutMillis: 30000,
})

/** Execute en lecture seule, avec un delai maximal. */
async function lire(sql, params = []) {
  const c = await pool.connect()
  try {
    await c.query("BEGIN READ ONLY")
    await c.query(`SET LOCAL statement_timeout = ${DELAI_MS}`)
    const r = await c.query(sql, params)
    await c.query("COMMIT")
    return r
  } catch (e) {
    try { await c.query("ROLLBACK") } catch { /* connexion deja perdue */ }
    throw e
  } finally {
    c.release()
  }
}

/** N'accepte qu'une seule lecture. Tout le reste est refuse avant d'atteindre la base. */
function verifierRequete(sql) {
  const t = String(sql || "").trim().replace(/;+\s*$/, "")
  if (!t) return "requête vide"
  if (t.includes(";")) return "une seule instruction à la fois"
  if (!/^(select|with)\b/i.test(t)) return "seules les lectures sont autorisées (SELECT ou WITH)"
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy)\b/i.test(t)) {
    return "mot-clé d'écriture détecté"
  }
  return null
}

const json = (res, code, corps) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  res.end(JSON.stringify(corps))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1")
  const chemin = url.pathname.replace(/^\/api/, "")

  try {
    // Liste des tables avec leur nombre de lignes réel.
    if (chemin === "/tables") {
      const { rows: tables } = await lire(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
      )
      const sortie = []
      for (const t of tables) {
        const { rows } = await lire(`SELECT count(*)::int AS n FROM "${t.table_name}"`)
        const { rows: cols } = await lire(
          `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name=$1`, [t.table_name]
        )
        sortie.push({ nom: t.table_name, lignes: rows[0].n, colonnes: cols[0].n })
      }
      return json(res, 200, { tables: sortie })
    }

    // Schema : tables, colonnes, cles primaires et etrangeres. Sert a dessiner
    // le voisinage d'une table plutot qu'un diagramme global illisible.
    if (chemin === "/schema") {
      const { rows: cols } = await lire(
        `SELECT table_name, column_name, data_type, is_nullable, ordinal_position
         FROM information_schema.columns WHERE table_schema='public'
         ORDER BY table_name, ordinal_position`
      )
      // information_schema masque les contraintes aux roles qui ne sont pas
      // proprietaires des tables. Le role etant volontairement en lecture seule,
      // on passe par le catalogue systeme, lisible par tous.
      const { rows: contraintes } = await lire(
        `SELECT co.contype,
                src.relname AS source,
                a.attname   AS colonne,
                tgt.relname AS cible,
                af.attname  AS colonne_cible,
                CASE co.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
                     WHEN 'r' THEN 'RESTRICT' WHEN 'd' THEN 'SET DEFAULT' ELSE 'NO ACTION' END AS suppression
         FROM pg_constraint co
         JOIN pg_class src ON src.oid = co.conrelid
         JOIN pg_namespace n ON n.oid = src.relnamespace AND n.nspname = 'public'
         LEFT JOIN pg_class tgt ON tgt.oid = co.confrelid
         JOIN LATERAL unnest(co.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
         JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = k.attnum
         LEFT JOIN LATERAL unnest(co.confkey) WITH ORDINALITY AS fk2(attnum, ord) ON fk2.ord = k.ord
         LEFT JOIN pg_attribute af ON af.attrelid = co.confrelid AND af.attnum = fk2.attnum
         WHERE co.contype IN ('p','f')
         ORDER BY src.relname, a.attname`
      )
      const pk = contraintes.filter(c => c.contype === "p").map(c => ({ table_name: c.source, column_name: c.colonne }))
      const fk = contraintes.filter(c => c.contype === "f").map(c => ({
        source: c.source, colonne: c.colonne, cible: c.cible,
        colonne_cible: c.colonne_cible, suppression: c.suppression,
      }))
      const clefs = new Set(pk.map(r => r.table_name + "." + r.column_name))
      const liens = new Set(fk.map(r => r.source + "." + r.colonne))
      const tables = {}
      for (const c of cols) {
        (tables[c.table_name] ||= []).push({
          nom: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === "YES",
          pk: clefs.has(c.table_name + "." + c.column_name),
          fk: liens.has(c.table_name + "." + c.column_name),
        })
      }
      return json(res, 200, { tables, relations: fk })
    }

    // Contenu d'une table, pagine.
    if (chemin.startsWith("/table/")) {
      const nom = decodeURIComponent(chemin.slice("/table/".length))
      const { rows: ok } = await lire(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [nom]
      )
      if (!ok.length) return json(res, 404, { erreur: "table inconnue" })

      const { rows: cols } = await lire(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name=$1 ORDER BY ordinal_position`, [nom]
      )
      const noms = cols.map(c => c.column_name)
      const limite = Math.min(parseInt(url.searchParams.get("limite") || "50", 10) || 50, MAX_LIGNES)
      const decalage = Math.max(parseInt(url.searchParams.get("decalage") || "0", 10) || 0, 0)
      const tri = noms.includes(url.searchParams.get("tri")) ? url.searchParams.get("tri") : noms[0]
      const sens = url.searchParams.get("sens") === "asc" ? "ASC" : "DESC"

      const { rows } = await lire(
        `SELECT * FROM "${nom}" ORDER BY "${tri}" ${sens} NULLS LAST LIMIT $1 OFFSET $2`, [limite, decalage]
      )
      const { rows: tot } = await lire(`SELECT count(*)::int AS n FROM "${nom}"`)
      return json(res, 200, { nom, colonnes: cols, lignes: rows, total: tot[0].n, limite, decalage, tri, sens })
    }

    // Requête libre, en lecture seule.
    if (chemin === "/query" && req.method === "POST") {
      let corps = ""
      for await (const bout of req) {
        corps += bout
        if (corps.length > 20000) return json(res, 413, { erreur: "requête trop longue" })
      }
      const { sql } = JSON.parse(corps || "{}")
      const refus = verifierRequete(sql)
      if (refus) return json(res, 400, { erreur: refus })

      const debut = Date.now()
      const r = await lire(`SELECT * FROM (${String(sql).trim().replace(/;+\s*$/, "")}) AS q LIMIT ${MAX_LIGNES}`)
      return json(res, 200, {
        colonnes: r.fields.map(f => ({ column_name: f.name, data_type: "" })),
        lignes: r.rows,
        total: r.rows.length,
        ms: Date.now() - debut,
        tronque: r.rows.length >= MAX_LIGNES,
      })
    }

    // Erreurs serveur : journal du conteneur backend et 5xx de nginx.
    //
    // ATTENTION, rien de brut ne sort d'ici. Les erreurs axios journalisees
    // embarquent les en-tetes de la requete, donc le jeton d'acces Spotify en
    // clair. On n'extrait que la date, le niveau, le nom de l'evenement et un
    // resume court, et on caviarde par securite tout ce qui ressemble a un
    // secret avant de repondre.
    if (chemin === "/erreurs") {
      const heures = Math.min(Math.max(parseInt(url.searchParams.get("heures") || "168", 10) || 168, 1), 720)

      const caviarder = (t) => String(t)
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [masqué]")
        .replace(/("(?:authorization|token|password|secret|api[_-]?key)"\s*:\s*)"[^"]*"/gi, '$1"[masqué]"')
        .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[masqué]")

      let brut = ""
      try {
        brut = execFileSync("docker", ["logs", "--since", `${heures}h`, "blindify-backend"],
          { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })
      } catch (e) {
        brut = (e.stdout || "") + (e.stderr || "")
      }

      const LIGNE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+\[[^\]]*?(error|warn|info|debug)[^\]]*?\]\s+(\S+)\s*(.*)$/
      const evenements = new Map()
      const recentes = []
      let total = 0

      for (const ligne of brut.split("\n")) {
        const sansCouleur = ligne.replace(/\u001b\[[0-9;]*m/g, "")
        const m = LIGNE.exec(sansCouleur)
        if (!m) continue
        const [, quand, niveau, evenement, reste] = m
        if (niveau !== "error" && niveau !== "warn") continue
        total++

        // Resume court : on pioche quelques champs utiles, jamais le bloc entier.
        let detail = ""
        try {
          const o = JSON.parse(reste)
          const bouts = [
            o?.error?.message || o?.message,
            o?.error?.status ? "HTTP " + o.error.status : null,
            o?.provider, o?.roomCode, o?.step,
          ].filter(Boolean)
          detail = bouts.join(" · ")
        } catch {
          detail = reste.slice(0, 120)
        }
        detail = caviarder(detail).slice(0, 180)

        const e = evenements.get(evenement) || { evenement, niveau, n: 0, dernier: quand, exemple: detail }
        e.n++; e.dernier = quand
        if (!e.exemple && detail) e.exemple = detail
        evenements.set(evenement, e)
        recentes.push({ quand, niveau, evenement, detail })
      }

      // 5xx cote nginx : volume, et ce qui est vise (souvent un scanner).
      let nginx = { total: 0, cibles: [] }
      try {
        const sortie = execFileSync("sh", ["-c",
          "awk '$9 ~ /^5/ {print $9\" \"$7}' /var/log/nginx/access.log 2>/dev/null | sort | uniq -c | sort -rn | head -12"],
          { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 })
        const l = sortie.trim().split("\n").filter(Boolean).map(x => {
          const [, n, code, cible] = /^\s*(\d+)\s+(\d{3})\s+(.*)$/.exec(x) || []
          return n ? { n: Number(n), code, cible: caviarder(cible).slice(0, 80) } : null
        }).filter(Boolean)
        nginx = { total: l.reduce((s2, x) => s2 + x.n, 0), cibles: l }
      } catch { /* journal nginx illisible, on n'affiche rien */ }

      return json(res, 200, {
        heures,
        total,
        evenements: [...evenements.values()].sort((a, b) => b.n - a.n),
        recentes: recentes.slice(-40).reverse(),
        nginx,
      })
    }

    return json(res, 404, { erreur: "route inconnue" })
  } catch (e) {
    return json(res, 400, { erreur: String(e.message || e).slice(0, 400) })
  }
})

server.listen(PORT, "127.0.0.1", () => console.log(`explorateur de base sur 127.0.0.1:${PORT}`))
