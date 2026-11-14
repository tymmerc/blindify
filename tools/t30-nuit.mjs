// T30 : palette nuit chaude (maquette) et remappage des couleurs calculees d'une page.
// Palette nuit : clair -> sombre, par role.
export const NUIT = {
  text: {
    "2e2014": "efe3cb", "241a10": "f6ecd8", "3a2a1a": "e6d8bd", "1d140b": "fbf3e3",
    "f4ecdb": "f4ecdb", "fbf6ea": "f4ecdb", "ece1c8": "ece1c8",
    "6b573f": "cbb898", "8a7558": "a8957a", "b3a182": "7a6853",
    "c65133": "e8714f", "cc4830": "e8714f", "b8492d": "e8714f", "9c2f1d": "ec8670", "b3261e": "ec8670", "7a1712": "ec8670",
    "e0a32e": "e8b04a", "a87714": "e0a32e", "d88418": "e89a35",
    "7d9471": "9db492", "789084": "9db492", "5d7252": "a8c09b", "4f6a45": "a8c09b",
    "486090": "93aadb", "5b7d99": "93aadb",
  },
  bg: {
    "f4ecdb": "1b140e", "fbf6ea": "221a13", "ece1c8": "261c14", "efe5d0": "211811",
    "e6d9bd": "2d2118", "e9dcc0": "2d2118", "e0d4ba": "33261b", "d8cdb4": "3a2c20",
    "2e2014": "0e0a07", "241a10": "0b0805", "3a2a1a": "120d09", "1d140b": "060403",
    "b3a182": "5a4a39", "8a7558": "6f5d48",
  },
  border: {
    "2e2014": "dccdb0", "241a10": "dccdb0", "3a2a1a": "dccdb0",
    "f4ecdb": "1b140e", "ece1c8": "261c14", "efe5d0": "211811",
    "6b573f": "a8957a", "8a7558": "8a7a64", "b3a182": "5a4a39",
    "c65133": "e8714f", "9c2f1d": "ec8670",
  },
  // Les ombres dures restent sombres : un noir chaud sous la carte.
  shadow: { "2e2014": "050302", "f4ecdb": "050302" },
}

// Execute dans la page.
export async function nuitChaude(N) {
  const hex2 = (r, g, b) => [r, g, b].map(x => Math.round(x).toString(16).padStart(2, "0")).join("")
  const swap = (val, map) => val.replace(/rgba?\(([^)]+)\)/g, (m, inner) => {
    const p = inner.split(/[\s,/]+/).filter(Boolean)
    const h = hex2(+p[0], +p[1], +p[2])
    const to = map[h]
    if (!to) return m
    const a = p[3] !== undefined ? p[3] : "1"
    const n = parseInt(to, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
  })
  const els = [document.documentElement, ...document.querySelectorAll("body, body *")]
  const plan = els.map(el => {
    const cs = getComputedStyle(el)
    return [el, {
      color: swap(cs.color, N.text),
      "background-color": swap(cs.backgroundColor, N.bg),
      "border-top-color": swap(cs.borderTopColor, N.border),
      "border-right-color": swap(cs.borderRightColor, N.border),
      "border-bottom-color": swap(cs.borderBottomColor, N.border),
      "border-left-color": swap(cs.borderLeftColor, N.border),
      "outline-color": swap(cs.outlineColor, N.border),
      "text-decoration-color": swap(cs.textDecorationColor, N.text),
      "box-shadow": swap(cs.boxShadow, N.shadow),
      fill: swap(cs.fill, N.text),
      stroke: swap(cs.stroke, N.text),
      "background-image": cs.backgroundImage.includes("gradient") ? swap(swap(cs.backgroundImage, N.bg), N.text) : null,
    }]
  })
  for (const [el, st] of plan) for (const [k, v] of Object.entries(st)) if (v) el.style.setProperty(k, v, "important")
  const css = document.createElement("style")
  css.textContent = "nextjs-portal{display:none!important} html{color-scheme:dark} body::after{mix-blend-mode:screen!important;opacity:.22!important}"
  document.head.appendChild(css)
  // Logo : le B noir passe en creme.
  for (const img of document.querySelectorAll('img[src*="logo"]')) {
    await Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 3000))])
    if (!img.naturalWidth) continue
    const c = document.createElement("canvas")
    c.width = img.naturalWidth; c.height = img.naturalHeight
    const x = c.getContext("2d"); x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < d.data.length; i += 4) {
      const [r, g, bb] = [d.data[i], d.data[i + 1], d.data[i + 2]]
      const mx = Math.max(r, g, bb), mn = Math.min(r, g, bb)
      if (mx < 110 && mx - mn < 30) { const t = mx / 110; d.data[i] = 239 - t * 40; d.data[i + 1] = 227 - t * 40; d.data[i + 2] = 203 - t * 40 }
    }
    x.putImageData(d, 0, 0)
    img.srcset = ""; img.src = c.toDataURL()
  }
}

// Le bouton propose : un rond comme le "?" de /jouer/, lune en clair, soleil en sombre.
export function poserBouton(ou) {
  const lune = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
  const soleil = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-15.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'
  const fait = (icone, label) => {
    const el = document.createElement("button")
    el.setAttribute("aria-label", label)
    el.dataset.t30 = "bouton"
    el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icone}</svg>`
    Object.assign(el.style, { width: "36px", height: "36px", borderRadius: "999px", border: "1.5px solid #2e2014", background: "#ece1c8", color: "#2e2014", boxShadow: "2px 2px 0 #2e2014", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none", cursor: "pointer" })
    return el
  }
  if (ou === "entete") {
    const nav = document.querySelector('nav[aria-label="Navigation principale"]')
    if (nav) nav.prepend(fait(lune, "Passer en mode sombre"))
    if (nav) nav.style.gap = window.innerWidth < 600 ? "12px" : "20px"
  } else if (ou === "pile") {
    const el = fait(lune, "Passer en mode sombre")
    const isMobile = window.innerWidth < 640
    Object.assign(el.style, { position: "fixed", right: isMobile ? "16px" : "24px", bottom: isMobile ? "64px" : "72px", zIndex: 30 })
    document.body.appendChild(el)
  }
  window.__t30Soleil = soleil
}
// Apres le passage en sombre, l'icone devient le soleil.
export function soleilApres() {
  for (const b of document.querySelectorAll('[data-t30="bouton"]')) {
    b.setAttribute("aria-label", "Passer en mode clair")
    b.querySelector("svg").innerHTML = window.__t30Soleil
  }
}
