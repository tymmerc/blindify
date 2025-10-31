'use client';

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LayoutGradient from "@/components/ui/LayoutGradient";
import Navbar from "@/components/ui/Navbar";

export default function Callback() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const access = searchParams.get("access_token");
    const expiresIn = searchParams.get("expires_in");
    const refresh = searchParams.get("refresh_token");

    if (access) {
      // Sauvegarde du token dans le localStorage
      localStorage.setItem("spotify_access_token", access);
      localStorage.setItem(
        "spotify_expires_at",
        String(Date.now() + Number(expiresIn || 3600) * 1000)
      );
      if (refresh) localStorage.setItem("spotify_refresh_token", refresh);

      console.log("✅ Spotify token enregistré :", access);

      // Redirection propre après stockage
      setTimeout(() => router.replace("/menu"), 500);
    } else {
      console.error("❌ Aucun token trouvé dans l'URL");
      setTimeout(() => router.replace("/"), 1000);
    }
  }, [router, searchParams]);

  return (
    <LayoutGradient>
      <Navbar />
      <div className="flex flex-1 items-center justify-center">
        <p className="text-lg text-gray-300">Connexion à Spotify...</p>
      </div>
    </LayoutGradient>
  );
}
