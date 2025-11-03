"use client";

import React from "react";
import "./globals.css"; 
import LayoutGradient from "@/components/ui/LayoutGradient";
import Navbar from "@/components/ui/Navbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body
        data-theme="dark"
        className="bg-gradient-to-b from-[#0d0b20] to-[#070616] text-white min-h-screen"
      >
        <LayoutGradient>
          <Navbar />
          <main className="pt-24 px-6">{children}</main>
        </LayoutGradient>
      </body>
    </html>
  );
}
