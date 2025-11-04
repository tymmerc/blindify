"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("access_token");
    const expires = params.get("expires_in");
    if (token) {
      localStorage.setItem("spotify_access_token", token);
      if (expires) localStorage.setItem("spotify_access_token_expires_in", expires);
      // renvoie utilisateur vers le menu ou la page de jeu
      router.replace("/app/menu");
    } else {
      router.replace("/app/auth/login");
    }
  }, [params, router]);

  return <div className="min-h-screen grid place-items-center">Connexion…</div>;
}
