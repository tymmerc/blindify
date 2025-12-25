export type LobbyStatus = "idle" | "creating" | "joining" | "hosting" | "waiting" | "starting" | "playing" | "results" | "error"

export type LobbyContext = {
  status: LobbyStatus
  message: string | null
}

type LobbyAction =
  | { type: "reset" }
  | { type: "creating" }
  | { type: "created" }
  | { type: "joining" }
  | { type: "joined" }
  | { type: "hosting" }
  | { type: "waiting" }
  | { type: "starting" }
  | { type: "playing" }
  | { type: "results" }
  | { type: "error"; message: string }

export const initialLobbyContext: LobbyContext = { status: "idle", message: null }

export function lobbyReducer(state: LobbyContext, action: LobbyAction): LobbyContext {
  switch (action.type) {
    case "reset":
      return { status: "idle", message: null }
    case "creating":
      return { status: "creating", message: null }
    case "created":
      return { status: "hosting", message: null }
    case "joining":
      return { status: "joining", message: null }
    case "joined":
      return { status: "waiting", message: null }
    case "hosting":
      return { status: "hosting", message: null }
    case "waiting":
      return { status: "waiting", message: null }
    case "starting":
      return { status: "starting", message: null }
    case "playing":
      return { status: "playing", message: null }
    case "results":
      return { status: "results", message: null }
    case "error":
      return { status: "error", message: action.message }
    default:
      return state
  }
}
