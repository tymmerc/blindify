// node --test tools/sonde-prod/*.test.mjs
import { test } from "node:test"
import assert from "node:assert/strict"
import { parseTargetUrl, buildTargets, DEFAULT_TARGETS } from "./targets.mjs"

test("liens par defaut : Deezer puis Spotify, en https", () => {
  assert.deepEqual(buildTargets({}).map(t => t.id), ["deezer", "spotify"])
  assert.ok(DEFAULT_TARGETS.every(t => parseTargetUrl(t.provider, t.url) === t.url))
})

test("liens en option : valides, sinon une erreur claire", () => {
  const forced = buildTargets({ deezer: "https://www.deezer.com/fr/playlist/1", only: "deezer" })
  assert.deepEqual(forced.map(t => [t.id, t.url, t.label]), [["deezer", "https://www.deezer.com/fr/playlist/1", "Deezer, https://www.deezer.com/fr/playlist/1"]])
  assert.throws(() => buildTargets({ deezer: "https://evil.example/playlist/1" }), /--deezer/)
  assert.throws(() => buildTargets({ spotify: "http://open.spotify.com/playlist/x" }), /--spotify/)
  assert.throws(() => buildTargets({ only: "youtube" }), /--only/)
  assert.equal(parseTargetUrl("deezer", "pas une url"), null)
  assert.equal(parseTargetUrl("spotify", "https://open.spotify.com.evil.example/playlist/x"), null)
})
