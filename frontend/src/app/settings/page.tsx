import type { Metadata } from "next"
import { GoToAccount } from "@/components/account/GoToAccount"

// Page fondue dans « Mon compte » (/profile/) le 05/11/2026.
export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false, follow: false },
}

export default function OldAccountPage() {
  return <GoToAccount />
}
