// Le proxy de Discord insere dans le <head> un <script type="text/javascript">
// a lui (releve le 14/10/2026) : React ne le connait pas et l'hydratation
// echoue (erreur 418). Le petit script du layout le retire avant l'hydratation.
import { beforeEach, describe, expect, it } from "vitest"
import { DISCORD_HEAD_CLEANUP } from "@/lib/discord/headCleanup"

const run = (hostname: string) => new Function("document", "location", DISCORD_HEAD_CLEANUP)(document, { hostname })

beforeEach(() => {
  document.head.innerHTML = [
    '<link rel="preload" as="script" href="/_next/static/chunks/webpack.js">',
    // Discord l'entoure de retours a la ligne : des noeuds texte que React
    // n'attend pas dans le <head>, ils partent avec lui.
    '\n<script type="text/javascript">RTCPeerConnection = null;</script>\n',
    '<script src="/_next/static/chunks/main.js" async></script>',
    '<script>document.documentElement.setAttribute("data-theme","dark")</script>',
    '<script type="application/ld+json">{}</script>',
  ].join("")
})

describe("DISCORD_HEAD_CLEANUP", () => {
  it("sous discordsays.com : retire le script injecte, garde ceux de Blindz", () => {
    run("1559906854111420416.discordsays.com")
    const scripts = Array.from(document.head.querySelectorAll("script"))
    expect(scripts.map(s => s.getAttribute("type") ?? s.getAttribute("src") ?? "inline")).toEqual([
      "/_next/static/chunks/main.js", "inline", "application/ld+json",
    ])

    const textNodes = Array.from(document.head.childNodes).filter(node => node.nodeType === Node.TEXT_NODE)
    expect(textNodes).toHaveLength(0)
  })

  it("ailleurs (blindz.app, dev) : ne touche a rien", () => {
    run("blindz.app")
    expect(document.head.querySelectorAll("script")).toHaveLength(4)
  })
})
