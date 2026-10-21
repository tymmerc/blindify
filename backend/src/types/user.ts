export type MusicProvider = "spotify" | "deezer" | "apple" | "local" | "guest" | "discord";

export interface AuthenticatedUser {
  id: number;
  provider: MusicProvider;
  provider_id: string;
  username: string | null;
  email: string | null;
  avatar: string | null;
  created_at: string;
}

export interface UserSessionToken {
  token: string;
  user_id: number;
  created_at: string;
  expires_at: string | null;
}
