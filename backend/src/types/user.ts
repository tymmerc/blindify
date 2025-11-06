export type MusicProvider = "spotify" | "deezer" | "apple" | "local" | "guest";

export interface AuthenticatedUser {
  id: number;
  provider: MusicProvider;
  provider_id: string;
  username: string | null;
  email: string | null;
  avatar: string | null;
  created_at: string;
}

export interface UserConnection {
  id: number;
  user_id: number;
  provider: MusicProvider;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface UserSessionToken {
  token: string;
  user_id: number;
  created_at: string;
  expires_at: string | null;
}
