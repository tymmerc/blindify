"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export default function CallbackClient() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = params.get("access_token");

    if (token) {
      localStorage.setItem("spotify_access_token", token);
      router.replace("/menu");
      return;
    }

    router.replace("/auth/login");
  }, [params, router]);

  return null; // no UI needed
}
