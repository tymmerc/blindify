const express = require("express")
const { spawn } = require("child_process")
const path = require("path")
const fs = require("fs")

const app = express()
const PORT = 9400

// ── Projects config ──
const PROJECTS = {
  blindify: {
    name: "Blindify",
    root: "/opt/blindify/frontend",
    e2eDir: "e2e",
    theme: {
      accent: "#8b3fd9", accentLight: "#a45ef0", accentBg: "rgba(139,63,217,0.1)",
      gradient: "linear-gradient(135deg, #8b3fd9, #c026d3)",
      bg: "#ece7f0", bgTag: "#e0d4ec", border: "#c9b8d6", borderHover: "#a48dba",
      textSecondary: "#4a3660", textMuted: "#7d6a92",
      shadow: "rgba(50,20,70",
    },
  },
  veille: {
    name: "Veille App",
    root: "/opt/veille-app",
    e2eDir: "e2e",
    theme: {
      accent: "#0369a1", accentLight: "#0ea5e9", accentBg: "rgba(3,105,161,0.1)",
      gradient: "linear-gradient(135deg, #0369a1, #06b6d4)",
      bg: "#e7eef3", bgTag: "#d4e3ed", border: "#b8ccd8", borderHover: "#8dafc2",
      textSecondary: "#2e4a5e", textMuted: "#6a8698",
      shadow: "rgba(20,40,60",
    },
  },
}

// ── Auto-discover tests from spec files ──
function discoverTests(projectId) {
  const project = PROJECTS[projectId]
  if (!project) return []
  const dir = path.join(project.root, project.e2eDir)
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".spec.ts") || f.endsWith(".spec.js"))
    return files.map((file) => {
      const filePath = path.join(dir, file)
      const subtests = parseSubTests(filePath)
      const name = file
        .replace(/\.spec\.(ts|js)$/, "")
        .replace(/^\d+-/, "")
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
      const description = generateDescription(filePath, subtests)
      const category = guessCategory(file, filePath)
      return { file, name, subtests, description, category }
    })
  } catch {
    return []
  }
}

function guessCategory(file, filePath) {
  const lower = file.toLowerCase()
  // From filename patterns
  if (lower.includes("audit") || lower.includes("navigation") || lower.includes("flow") || lower.includes("all-flow")) return "Navigation"
  if (lower.includes("solo") || lower.includes("chrono") || lower.includes("challenge") || lower.includes("audio")) return "Solo"
  if (lower.includes("multi") || lower.includes("2player") || lower.includes("sync") || lower.includes("event") || lower.includes("wizard") || lower.includes("lobby") || lower.includes("room")) return "Multiplayer"
  if (lower.includes("bug") || lower.includes("fix") || lower.includes("regression")) return "Qualite"
  if (lower.includes("auth") || lower.includes("login")) return "Auth"
  if (lower.includes("api") || lower.includes("endpoint")) return "API"
  if (lower.includes("mobile") || lower.includes("responsive")) return "Mobile"
  if (lower.includes("setting") || lower.includes("config") || lower.includes("pref")) return "Config"
  // From test.describe
  try {
    const content = fs.readFileSync(filePath, "utf-8")
    const descMatch = content.match(/test\.describe\(\s*["'`]([^"'`]+)["'`]/)
    if (descMatch) {
      const d = descMatch[1].toLowerCase()
      if (d.includes("nav") || d.includes("link") || d.includes("page") || d.includes("route")) return "Navigation"
      if (d.includes("auth") || d.includes("login")) return "Auth"
      if (d.includes("api") || d.includes("health")) return "API"
    }
  } catch {}
  return "Autre"
}

function generateDescription(filePath, subtests) {
  try {
    const content = fs.readFileSync(filePath, "utf-8")
    const descMatch = content.match(/test\.describe\(\s*["'`]([^"'`]+)["'`]/)
    const group = descMatch ? descMatch[1] : ""
    const n = subtests.length

    if (n === 0) return "Ce fichier ne contient aucun test detecte."

    // Humanize test names: strip "should", clean up technical names
    function humanize(s) {
      return s
        .replace(/^should\s+/i, "")
        .replace(/^it\s+/i, "")
        .replace(/^test\s+that\s+/i, "")
        .replace(/^verify\s+that\s+/i, "")
        .replace(/^check\s+that\s+/i, "")
    }

    const names = subtests.map(humanize)

    if (n === 1) {
      return `${group ? group + " — v" : "V"}erifie que l'application ${names[0]}.`
    }

    if (n === 2) {
      return `${group ? group + " — " : ""}${n} tests : ${names[0]}, et ${names[1]}.`
    }

    // 3+
    const listed = names.slice(0, 2).join(", ")
    const rest = n - 2
    return `${group ? group + " — " : ""}${n} tests couvrant : ${listed}, et ${rest} autre${rest > 1 ? "s" : ""} verification${rest > 1 ? "s" : ""}.`
  } catch {
    return ""
  }
}

function parseSubTests(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8")
    const results = []
    const regex = /test\(\s*["'`]([^"'`]+)["'`]/g
    let match
    while ((match = regex.exec(content)) !== null) results.push(match[1])
    return results
  } catch {
    return []
  }
}

// ── State ──
const projectTests = {}
const testStates = {}
const testHistory = {} // key -> [{status, duration, timestamp}]

function initProject(id) {
  projectTests[id] = discoverTests(id)
  projectTests[id].forEach((t) => {
    const key = `${id}:${t.file}`
    if (!testStates[key]) testStates[key] = { status: "idle", output: "", startTime: null, duration: null }
    if (!testHistory[key]) testHistory[key] = []
  })
}

Object.keys(PROJECTS).forEach(initProject)

let runningProcess = null

// ── Static ──
app.use(express.static(path.join(__dirname, "public")))

// Serve test-results per project
Object.entries(PROJECTS).forEach(([id, p]) => {
  app.use(`/results/${id}`, express.static(path.join(p.root, "test-results")))
  app.use(`/report/${id}`, express.static(path.join(p.root, "playwright-report")))
})

// ── API ──
app.get("/api/projects", (_req, res) => {
  const data = Object.entries(PROJECTS).map(([id, p]) => {
    const tests = projectTests[id] || []
    const states = tests.map((t) => testStates[`${id}:${t.file}`]?.status || "idle")
    return {
      id,
      name: p.name,
      theme: p.theme,
      testCount: tests.length,
      subtestCount: tests.reduce((a, t) => a + t.subtests.length, 0),
      passed: states.filter((s) => s === "passed").length,
      failed: states.filter((s) => s === "failed").length,
      running: states.filter((s) => s === "running" || s === "queued").length,
    }
  })
  res.json(data)
})

app.get("/api/project/:id/tests", (req, res) => {
  const id = req.params.id
  if (!PROJECTS[id]) return res.status(404).json({ error: "Project not found" })
  const tests = (projectTests[id] || []).map((t) => ({
    ...t,
    ...testStates[`${id}:${t.file}`],
  }))
  res.json(tests)
})

app.get("/api/project/:id/test/:file", (req, res) => {
  const { id, file } = req.params
  if (!PROJECTS[id]) return res.status(404).json({ error: "Project not found" })
  const test = (projectTests[id] || []).find((t) => t.file === file)
  if (!test) return res.status(404).json({ error: "Test not found" })

  let source = ""
  try { source = fs.readFileSync(path.join(PROJECTS[id].root, PROJECTS[id].e2eDir, file), "utf-8") } catch {}

  const artifacts = getArtifacts(id, file)

  const key = `${id}:${file}`
  // Return history without output (too heavy), just metadata
  const historyLight = (testHistory[key] || []).map(h => ({ id: h.id, status: h.status, duration: h.duration, timestamp: h.timestamp }))
  res.json({ ...test, ...testStates[key], source, artifacts, project: PROJECTS[id].name, projectId: id, theme: PROJECTS[id].theme, history: historyLight })
})

app.get("/api/project/:id/test/:file/run/:runId", (req, res) => {
  const { id, file, runId } = req.params
  const key = `${id}:${file}`
  const hist = testHistory[key] || []
  const run = hist.find(h => h.id === runId)
  if (!run) return res.status(404).json({ error: "Run not found" })
  res.json(run)
})

function getArtifacts(projectId, file) {
  try {
    const resultsDir = path.join(PROJECTS[projectId].root, "test-results")
    const base = file.replace(/\.spec\.(ts|js)$/, "")
    const dirs = fs.readdirSync(resultsDir).filter((d) => {
      const lower = d.toLowerCase()
      return lower.includes(base.replace(/-/g, "-")) || lower.includes(base.replace(/-/g, ""))
    })
    const artifacts = { screenshots: [], videos: [], traces: [] }
    for (const dir of dirs) {
      const full = path.join(resultsDir, dir)
      if (!fs.statSync(full).isDirectory()) continue
      for (const f of fs.readdirSync(full)) {
        const rel = `/results/${projectId}/${dir}/${f}`
        if (f.endsWith(".png") || f.endsWith(".jpg")) artifacts.screenshots.push({ url: rel, name: f })
        else if (f.endsWith(".webm") || f.endsWith(".mp4")) artifacts.videos.push({ url: rel, name: f })
        else if (f.endsWith(".zip") && f.includes("trace")) artifacts.traces.push({ url: rel, name: f })
      }
    }
    return artifacts
  } catch {
    return { screenshots: [], videos: [], traces: [] }
  }
}

function runFile(projectId, file) {
  const key = `${projectId}:${file}`
  const project = PROJECTS[projectId]
  testStates[key] = { status: "running", output: "", startTime: Date.now(), duration: null }

  const proc = spawn("npx", ["playwright", "test", file, "--reporter=html,line"], {
    cwd: project.root,
    env: { ...process.env, PLAYWRIGHT_HTML_OPEN: "never" },
  })
  runningProcess = proc
  let output = ""
  proc.stdout.on("data", (d) => { output += d.toString(); testStates[key].output = output })
  proc.stderr.on("data", (d) => { output += d.toString(); testStates[key].output = output })
  return new Promise((resolve) => {
    proc.on("close", (code) => {
      runningProcess = null
      const duration = Date.now() - testStates[key].startTime
      const status = code === 0 ? "passed" : "failed"
      testStates[key].status = status
      testStates[key].duration = duration
      testStates[key].output = output
      // Save to history (max 20) with full output + artifacts
      if (!testHistory[key]) testHistory[key] = []
      testHistory[key].unshift({
        id: Date.now().toString(36),
        status,
        duration,
        timestamp: new Date().toISOString(),
        output,
        artifacts: getArtifacts(projectId, file),
      })
      if (testHistory[key].length > 20) testHistory[key].length = 20
      resolve()
    })
  })
}

app.post("/api/project/:id/run/:file", (req, res) => {
  const { id, file } = req.params
  if (!PROJECTS[id]) return res.status(404).json({ error: "Project not found" })
  if (runningProcess) return res.status(409).json({ error: "A test is already running" })
  runFile(id, file)
  res.json({ ok: true })
})

app.post("/api/project/:id/run-all", (req, res) => {
  const id = req.params.id
  if (!PROJECTS[id]) return res.status(404).json({ error: "Project not found" })
  if (runningProcess) return res.status(409).json({ error: "A test is already running" })

  const tests = projectTests[id] || []
  tests.forEach((t) => { testStates[`${id}:${t.file}`] = { status: "queued", output: "", startTime: null, duration: null } })

  async function seq(i) {
    if (i >= tests.length) return
    await runFile(id, tests[i].file)
    seq(i + 1)
  }
  seq(0)
  res.json({ ok: true })
})

app.listen(PORT, "127.0.0.1", () => {
  console.log(`ME2ER running on http://127.0.0.1:${PORT}`)
})
