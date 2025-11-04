"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CallbackClient() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = params.get("access_token");
    if (token) {
      localStorage.setItem("spotify_access_token", token);
      router.push("/app");
    }
  }, [params, router]);

  return <p>Authentification…</p>;
}
