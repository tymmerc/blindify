/**
 * Tests d'integration API — Blindify
 *
 * Ce fichier teste l'API Blindify SANS navigateur.
 * On utilise uniquement `request` de Playwright pour envoyer des requetes HTTP.
 *
 * Concepts couverts :
 * - Envoyer un POST et verifier la reponse
 * - Envoyer un GET et lire le JSON
 * - Tester un workflow async (creer → suivre → verifier)
 * - Gerer les cas d'erreur (donnees invalides, ressource inexistante)
 * - Polling avec timeout (attendre qu'un traitement se termine)
 */

import { test, expect } from "@playwright/test"

// Base URL de l'API Blindify
const API = "https://tymmerc.eu/blindify/api"

// ============================================================================
// PARTIE 1 : Tests simples — Verifier que l'API repond
// ============================================================================

test.describe("1. Health checks — l'API est-elle en ligne ?", () => {
  /**
   * Le test le plus basique : on appelle /health et on verifie que ca repond 200.
   * C'est l'equivalent de "est-ce que le serveur tourne ?"
   */
  test("GET /health retourne 200", async ({ request }) => {
    const response = await request.get(`${API}/health`)

    // Le status HTTP 200 = OK, le serveur repond
    expect(response.status()).toBe(200)
  })

  /**
   * On verifie aussi que la reponse est du JSON valide.
   * Une API doit toujours retourner du JSON structure, jamais du texte brut.
   */
  test("GET /health retourne du JSON valide", async ({ request }) => {
    const response = await request.get(`${API}/health`)
    const data = await response.json()

    // La reponse doit etre un objet (pas null, pas un string)
    expect(typeof data).toBe("object")
    expect(data).not.toBeNull()
  })
})

// ============================================================================
// PARTIE 2 : Creer une ressource — POST avec verification de reponse
// ============================================================================

test.describe("2. Challenges API — creer et recuperer", () => {
  /**
   * CONCEPT CLE : Envoyer un POST avec des donnees et verifier la reponse.
   *
   * C'est exactement ce que ta prof demande dans "2.1 Test du lancement de la creation" :
   * → Envoyer une requete de creation
   * → Verifier que l'API accepte la demande
   * → Verifier que la reponse contient un identifiant
   */
  test("POST /challenges cree un challenge et retourne un code", async ({ request }) => {
    // On envoie les donnees de creation
    const response = await request.post(`${API}/challenges`, {
      data: {
        creatorName: "TestIntegration",
        score: 85,
        correct: 3,
        total: 5,
        tracks: [
          { title: "Blinding Lights", artist: "The Weeknd", previewUrl: "https://example.com/track1.mp3" },
          { title: "Bohemian Rhapsody", artist: "Queen", previewUrl: "https://example.com/track2.mp3" },
        ],
      },
    })

    // L'API doit accepter la requete (status 200)
    expect(response.status()).toBe(200)

    // On lit la reponse JSON
    const data = await response.json()

    // La reponse doit indiquer le succes
    expect(data.success).toBe(true)

    // La reponse doit contenir un CODE unique (comme un "jobId" dans le TP)
    // C'est cet identifiant qui permet de retrouver le challenge plus tard
    expect(data.data.code).toBeDefined()
    expect(data.data.code.length).toBe(8) // Les codes challenge font 8 caracteres
    console.log(`Challenge cree avec le code : ${data.data.code}`)
  })

  /**
   * CONCEPT CLE : Recuperer une ressource creee precedemment.
   *
   * C'est l'equivalent de "2.2 Test du suivi de job" :
   * → A partir de l'identifiant, interroger l'API
   * → Verifier que les donnees retournees correspondent a ce qu'on a envoye
   */
  test("GET /challenges/:code retourne le challenge cree", async ({ request }) => {
    // Etape 1 : Creer le challenge
    const createResponse = await request.post(`${API}/challenges`, {
      data: {
        creatorName: "VerifyBot",
        score: 100,
        correct: 5,
        total: 5,
        tracks: [
          { title: "Test Track", artist: "Test Artist", previewUrl: "https://example.com/t.mp3" },
        ],
      },
    })
    const createData = await createResponse.json()
    const code = createData.data.code

    // Etape 2 : Recuperer le challenge par son code
    const getResponse = await request.get(`${API}/challenges/${code}`)
    expect(getResponse.status()).toBe(200)

    const getData = await getResponse.json()
    expect(getData.success).toBe(true)

    // Etape 3 : Verifier que les donnees correspondent
    expect(getData.data.creatorName).toBe("VerifyBot")
    expect(getData.data.tracks.length).toBe(1)
    expect(getData.data.tracks[0].title).toBe("Test Track")
  })

  /**
   * CONCEPT CLE : Completer un workflow (creer → jouer → verifier le leaderboard)
   *
   * C'est l'equivalent de "2.4 Verification du resultat final" :
   * → Creer une ressource
   * → Effectuer une action dessus
   * → Verifier que le resultat final est correct
   */
  test("workflow complet : creer, completer, verifier le leaderboard", async ({ request }) => {
    // 1. Creer un challenge
    const create = await request.post(`${API}/challenges`, {
      data: {
        creatorName: "Creator",
        score: 80,
        correct: 4,
        total: 5,
        tracks: [
          { title: "Track A", artist: "Artist A", previewUrl: "https://example.com/a.mp3" },
          { title: "Track B", artist: "Artist B", previewUrl: "https://example.com/b.mp3" },
        ],
      },
    })
    const { code } = (await create.json()).data

    // 2. Un autre joueur complete le challenge
    const complete = await request.post(`${API}/challenges/${code}/complete`, {
      data: {
        playerName: "Challenger",
        score: 95,
        correct: 5,
        total: 5,
      },
    })
    expect(complete.status()).toBe(200)
    const completeData = await complete.json()
    expect(completeData.success).toBe(true)

    // 3. Verifier que le leaderboard contient le joueur
    expect(completeData.data.leaderboard).toBeDefined()
    expect(completeData.data.leaderboard.length).toBeGreaterThanOrEqual(1)
    console.log(`Leaderboard apres completion : ${completeData.data.leaderboard.length} entree(s)`)
  })
})

// ============================================================================
// PARTIE 3 : Cas d'erreur — l'API doit refuser les mauvaises requetes
// ============================================================================

test.describe("3. Gestion des erreurs", () => {
  /**
   * CONCEPT CLE : Tester les cas d'erreur.
   *
   * Une bonne API ne crash pas quand on envoie n'importe quoi.
   * Elle retourne un code d'erreur clair et un message explicatif.
   *
   * C'est la section "2.5 Cas de test a prevoir" du TP :
   * → Donnees invalides
   * → Ressource inexistante
   */

  test("GET /challenges/ZZZZZZZZ retourne une erreur pour un code inexistant", async ({ request }) => {
    const response = await request.get(`${API}/challenges/ZZZZZZZZ`)

    // L'API peut retourner 200 avec success=false, ou 404
    // Les deux sont acceptables, mais la reponse doit etre coherente
    const data = await response.json()
    expect(data.success).toBe(false)
    expect(data.error).toBeDefined()
    expect(data.error.code).toBe("challenge_not_found")
  })

  test("POST /challenges sans donnees retourne une erreur", async ({ request }) => {
    const response = await request.post(`${API}/challenges`, {
      data: {},
    })

    // L'API doit refuser : pas de tracks, pas de creatorName
    const data = await response.json()
    expect(data.success).toBe(false)
  })

  test("GET /games/history sans authentification retourne 401", async ({ request }) => {
    const response = await request.get(`${API}/games/history`)

    // Certains endpoints necessitent une session.
    // Sans cookie de session, l'API doit retourner 401 (Unauthorized)
    expect(response.status()).toBe(401)
  })
})

// ============================================================================
// PARTIE 4 : Traitement asynchrone — polling avec timeout
// ============================================================================

test.describe("4. Pattern async : creer une session guest puis une room (polling)", () => {
  /**
   * CONCEPT CLE : Traitement asynchrone avec polling.
   *
   * C'est LE concept central du TP de ta prof (sections 2.2 et 2.3).
   *
   * Le pattern :
   * 1. POST pour demarrer un traitement
   * 2. L'API retourne un identifiant
   * 3. GET en boucle pour suivre l'avancement
   * 4. Condition d'arret (succes ou timeout)
   *
   * Sur Blindify, on va :
   * 1. Creer une session guest (POST /auth/guest)
   * 2. Creer une room (POST /rooms/create)
   * 3. Verifier l'etat de la room (GET /rooms/:code)
   * 4. Poller jusqu'a ce que la room soit prete
   */
  test("creer une session, une room, et verifier son etat", async ({ playwright }) => {
    /**
     * Pour les requetes authentifiees, on cree un APIRequestContext dedie
     * qui gere automatiquement les cookies (comme un navigateur le ferait).
     *
     * C'est plus propre que de manipuler les headers Cookie manuellement.
     */
    const apiContext = await playwright.request.newContext({
      baseURL: "https://tymmerc.eu",
      extraHTTPHeaders: { Origin: "https://tymmerc.eu" },
      ignoreHTTPSErrors: true,
    })

    try {
      // === ETAPE 1 : Creer une session guest ===
      const guestResponse = await apiContext.post("/blindify/api/auth/guest", {
        data: { username: `test_integ_${Date.now()}` },
      })
      expect(guestResponse.status()).toBe(200)
      const guestData = await guestResponse.json()
      expect(guestData.success).toBe(true)
      console.log(`Session guest creee : ${guestData.data.user.username}`)
      // Les cookies de session sont automatiquement stockes dans apiContext

      // === ETAPE 2 : Creer une room (le "job") ===
      const roomResponse = await apiContext.post("/blindify/api/rooms/create", {
        data: {
          mode: "friends",
          maxPlayers: 10,
          questionCount: 5,
        },
      })
      expect(roomResponse.status()).toBe(200)
      const roomData = await roomResponse.json()
      expect(roomData.success).toBe(true)

      // L'API retourne un room_code : c'est notre "jobId"
      const roomCode = roomData.data.room.room_code
      expect(roomCode).toBeDefined()
      expect(roomCode.length).toBeGreaterThanOrEqual(5)
      console.log(`Room creee : ${roomCode}`)

      // La room est en status "waiting" (pas encore demarree)
      expect(roomData.data.room.status).toBe("waiting")

      // === ETAPE 3 : Polling — verifier l'etat de la room ===
      /**
       * ICI c'est le pattern de polling que ta prof veut te montrer.
       *
       * On interroge l'API a intervalles reguliers pour suivre l'evolution.
       * On s'arrete quand :
       * - Le traitement est termine (status change)
       * - OU on a depasse le nombre max de tentatives (timeout)
       */
      const MAX_POLLS = 5          // Maximum 5 tentatives
      const POLL_INTERVAL_MS = 1000 // 1 seconde entre chaque

      let lastStatus = ""
      for (let attempt = 1; attempt <= MAX_POLLS; attempt++) {
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        }

        const stateResponse = await apiContext.get(`/blindify/api/rooms/${roomCode}`)

        if (stateResponse.status() !== 200) {
          console.log(`Poll ${attempt}/${MAX_POLLS} : erreur HTTP ${stateResponse.status()}`)
          continue
        }

        const stateData = await stateResponse.json()
        lastStatus = stateData.data?.room?.status ?? "unknown"
        const playerCount = stateData.data?.participants?.length ?? 0

        console.log(`Poll ${attempt}/${MAX_POLLS} : status=${lastStatus}, joueurs=${playerCount}`)

        // Condition d'arret : la room est passee en "playing" ou "finished"
        if (lastStatus === "playing" || lastStatus === "finished") {
          console.log(`Traitement termine apres ${attempt} tentative(s)`)
          break
        }
      }

      // La room doit toujours etre en "waiting" (personne n'a lance la partie)
      expect(lastStatus).toBe("waiting")
      console.log("Polling termine : la room est bien en attente")
    } finally {
      await apiContext.dispose()
    }
  })

  /**
   * Test de timeout : que se passe-t-il si on polle un job inexistant ?
   * L'API doit retourner une erreur, pas rester bloquee.
   */
  test("GET /rooms/:code avec un code inexistant retourne une erreur", async ({ request }) => {
    const response = await request.get(`${API}/rooms/FAKECODE123`)

    // L'API doit refuser proprement
    expect(response.status()).not.toBe(200)
    // Ou retourner success: false
    const data = await response.json().catch(() => null)
    if (data) {
      expect(data.success).toBe(false)
    }
  })
})

// ============================================================================
// PARTIE 5 : Recapitulatif — workflow complet async
// ============================================================================

test.describe("5. Workflow complet : challenge create → complete → verify", () => {
  /**
   * Ce test combine tout ce qu'on a appris :
   *
   * 1. POST pour creer (= lancer un job)
   * 2. GET pour verifier l'etat initial
   * 3. POST pour modifier (= le job progresse)
   * 4. GET pour verifier le resultat final
   *
   * C'est exactement le workflow async de ta prof,
   * adapte au contexte Blindify.
   */
  test("cycle complet : creer un challenge, le jouer, verifier les scores", async ({ request }) => {
    // 1. CREER — equivalent de "lancer la creation de sites"
    const createRes = await request.post(`${API}/challenges`, {
      data: {
        creatorName: "Alice",
        score: 70,
        correct: 3,
        total: 5,
        tracks: [
          { title: "Shape of You", artist: "Ed Sheeran", previewUrl: "https://example.com/1.mp3" },
          { title: "Bad Guy", artist: "Billie Eilish", previewUrl: "https://example.com/2.mp3" },
          { title: "Starboy", artist: "The Weeknd", previewUrl: "https://example.com/3.mp3" },
        ],
      },
    })
    const code = (await createRes.json()).data.code
    console.log(`1. Challenge cree : ${code}`)

    // 2. VERIFIER L'ETAT INITIAL — le challenge existe mais personne ne l'a joue
    const initialRes = await request.get(`${API}/challenges/${code}`)
    const initial = await initialRes.json()
    expect(initial.success).toBe(true)
    expect(initial.data.creatorName).toBe("Alice")
    expect(initial.data.tracks.length).toBe(3)
    console.log(`2. Etat initial : ${initial.data.tracks.length} tracks, createur=${initial.data.creatorName}`)

    // 3. COMPLETER — un joueur releve le defi (= le job progresse)
    const completeRes = await request.post(`${API}/challenges/${code}/complete`, {
      data: { playerName: "Bob", score: 90, correct: 4, total: 5 },
    })
    const complete = await completeRes.json()
    expect(complete.success).toBe(true)
    console.log(`3. Bob a complete le challenge avec ${90} points`)

    // 4. VERIFIER LE RESULTAT FINAL — le leaderboard a ete mis a jour
    // On pourrait poller ici si le traitement etait async
    // Dans ce cas c'est synchrone, mais le pattern est le meme
    expect(complete.data.leaderboard.length).toBeGreaterThanOrEqual(1)

    // Verifier que Bob est dans le leaderboard
    const bobEntry = complete.data.leaderboard.find(
      (e: { playerName: string }) => e.playerName === "Bob"
    )
    expect(bobEntry).toBeDefined()
    expect(bobEntry.score).toBe(90)
    console.log(`4. Resultat final : Bob est dans le leaderboard avec ${bobEntry.score} pts`)
    console.log("=== WORKFLOW COMPLET VALIDE ===")
  })
})
