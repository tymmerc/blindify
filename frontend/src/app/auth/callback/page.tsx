"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("access_token");

    if (accessToken) {
      localStorage.setItem("spotify_access_token", accessToken);
      router.push("/menu");
    } else {
      // Si l'utilisateur vient du backend classique
      router.push("/menu");
    }
  }, [router]);

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-black text-white text-xl">
      <p>Authentification Spotify réussie ! 🎵</p>
      <p className="text-gray-400 text-base mt-2">Redirection en cours...</p>
    </main>
  );
}
