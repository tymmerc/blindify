"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

type Track = {
  spotify_track_id: string;
  title: string;
  artist: string;
  preview_url: string | null;
  album_cover: string | null;
};

export default function GamePage() {
  const router = useRouter();
  const [me, setMe] = useState<{ id: number } | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await api.checkAuth();
      if (!m) {
        router.replace("/auth/login");
        return;
      }
      setMe(m);
      const game = await api.startSoloGame({ count: 10 });
      setTracks(game.tracks);
    })();
  }, [router]);

  if (!me || tracks.length === 0) {
    return <div className="min-h-screen grid place-items-center">Chargement…</div>;
  }

  const current = tracks[idx];

  const reveal = () => setRevealed(true);

  const next = () => {
    setRevealed(false);
    setIdx((i) => Math.min(i + 1, tracks.length - 1));
  };

  const likeCurrent = async () => {
    if (!me) return;
    await api.addLike(me.id, current.spotify_track_id);
  };

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
        <button className="px-4 py-2 rounded border w-full" onClick={reveal}>
          Reveal
        </button>
      ) : (
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded border" onClick={likeCurrent}>
            Like ce titre
          </button>
          <button className="px-4 py-2 rounded border" onClick={next}>
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}
