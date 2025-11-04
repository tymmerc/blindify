"use client";
export const dynamic = "force-dynamic";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function Page() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = params.get("access_token");
    if (token) {
      localStorage.setItem("spotify_access_token", token);
      router.replace("/menu");
      return;
    }
  }, [params, router]);

  return <p>Authentification…</p>;
}
