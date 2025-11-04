"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function AuthLoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const run = async () => {
      const me = await api.checkAuth();
      if (me) {
        router.replace("/app/menu");
        return;
      }
      setChecking(false);
    };
    run();
  }, [router]);

  if (checking) {
    return <div className="min-h-screen grid place-items-center">Vérification…</div>;
  }

  const login = () => {
    window.location.href = api.getLoginUrl();
  };

  return (
    <div className="min-h-screen grid place-items-center">
      <button className="px-4 py-2 rounded border" onClick={login}>
        Se connecter avec Spotify
      </button>
    </div>
  );
}
