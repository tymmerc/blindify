"use client";

import React, { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import LayoutGradient from "@/components/ui/LayoutGradient";
import Navbar from "@/components/ui/Navbar";

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      localStorage.setItem("spotify_token", token);
      router.push("/app/menu");
    }
  }, [searchParams, router]);

  return (
    <div className="flex flex-col items-center justify-center h-screen text-center">
      <h1 className="text-3xl font-semibold mb-4">Connexion en cours...</h1>
      <p className="text-gray-400">Redirection vers ton espace Blindify 🎵</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <LayoutGradient>
      <Navbar />
      <Suspense fallback={<div>Chargement...</div>}>
        <CallbackContent />
      </Suspense>
    </LayoutGradient>
  );
}
