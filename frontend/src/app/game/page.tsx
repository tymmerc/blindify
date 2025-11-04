"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";

type Track = {
  spotify_track_id: string;
  title: string;
  artist: string;
  preview_url: string | null;
  album_cover: string | null;
};

export default function GamePage() {
  const router = useRouter();
  const params = useSearchParams();

  const [me, setMe] = useState<{ id: number } | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Normalize difficulty
  const rawDifficulty = params.get("difficulty");
  const difficulty: "easy" | "normal" | "hard" =
    rawDifficulty === "easy" || rawDifficulty === "hard"
      ? rawDifficulty
      : "normal";

  // Normalize source (backend expects liked_tracks)
  const rawSource = params.get("source");
  const source = rawSource === "playlist" || rawSource === "top-tracks"
    ? rawSource
    : "liked_tracks";

  useEffect(() => {
    const token = localStorage.getItem("spotify_access_token");
    if (!token) {
      router.replace("/auth/login");
      return;
    }

    (async () => {
      const m = await api.checkAuth();
      if (!m) {
        router.replace("/auth/login");
        return;
      }
      setMe(m);

      const game = await api.startSoloGame({
        difficulty,
        source,
        count: 10
      });

      setTracks(game.tracks);
    })();
  }, [router, difficulty, source]);

  useEffect(() => {
    if (!tracks.length) return;
    const current = tracks[idx];
    if (!current.preview_url) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(current.preview_url);
    } else {
      audioRef.current.pause();
      audioRef.current.src = current.preview_url;
    }

    audioRef.current.play().catch(() => {});
  }, [idx, tracks]);

  const next = () => {
    if (idx === tracks.length - 1) {
      router.replace("/menu");
      return;
    }
    setRevealed(false);
    setIdx((i) => i + 1);
  };

  const likeCurrent = async () => {
    if (!me) return;
    await api.addLike(me.id, tracks[idx].spotify_track_id);
  };

  if (!me || tracks.length === 0) {
    return <div className="min-h-screen grid place-items-center">Chargement…</div>;
  }

  const current = tracks[idx];

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="aspect-square bg-black/5 dark:bg-white/5 rounded-xl grid place-items-center mb-4">
        {revealed ? (
          <div className="text-center p-4">
            <div className="text-lg font-semibold">{current.title}</div>
            <div className="text-sm opacity-80">{current.artist}</div>
          </div>
        ) : (
          <div className="text-center p-4">Écoute et devine…</div>
        )}
      </div>

      {!revealed ? (
        <button className="px-4 py-2 rounded border w-full" onClick={() => setRevealed(true)}>
          Révéler
        </button>
      ) : (
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded border" onClick={likeCurrent}>
            Like
          </button>
          <button className="px-4 py-2 rounded border" onClick={next}>
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
