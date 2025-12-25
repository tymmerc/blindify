const STORAGE_KEY = "blindify:guest"

type GuestProfile = {
  id: string
  name: string
}

function generateGuest(): GuestProfile {
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `guest-${Math.random().toString(36).slice(2, 10)}`)
  const suffix = id.slice(-4).toUpperCase()
  return { id, name: `Invité ${suffix}` }
}

export function getOrCreateGuest(): GuestProfile {
  if (typeof window === "undefined") return generateGuest()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GuestProfile>
      if (parsed?.id && parsed?.name) {
        return { id: String(parsed.id), name: String(parsed.name) }
      }
    }
  } catch {
    // ignore parsing error and regenerate below
  }
  const profile = generateGuest()
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // non-blocking if storage fails
  }
  return profile
}
