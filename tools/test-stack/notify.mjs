// Alerte e-mail quand la campagne n'a meme pas pu tourner (pile, build,
// machine occupee). Les echecs de scenarios passent, eux, par campaign.mjs.
//   node notify.mjs "message"
import { sendAlert } from "./report.mjs"

const message = process.argv.slice(2).join(" ") || "campagne de nuit en echec"
const result = {
  rooms: [],
  egress: [],
  browser: { checks: [{ label: "Campagne de nuit", ok: false, problems: [message] }] },
}
await sendAlert(result, "https://dev.tymmerc.eu/blindz/tests/ (journal : /opt/blindify/.test-stack/logs/nightly.log)")
