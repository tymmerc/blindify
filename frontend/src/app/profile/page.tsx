import type { Metadata } from "next"
import { AccountScreen } from "./AccountScreen"

export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false, follow: false },
}

export default function ProfilePage() {
  return <AccountScreen />
}
