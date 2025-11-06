import type { MusicProvider } from "./user";

export interface AudioSourceRow {
  id: string;
  provider: MusicProvider;
  external_id: string | null;
  title: string;
  artist: string;
  album_cover: string | null;
  audio_url: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
}
