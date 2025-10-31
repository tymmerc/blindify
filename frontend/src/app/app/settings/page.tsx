"use client"

import PageHeader from "@/components/ui/PageHeader"
import SectionCard from "@/components/ui/SectionCard"
import ActionButton from "@/components/ui/ActionButton"

export default function SettingsPage() {
  return (
    <main className="page-container space-y-8">
      <PageHeader title="Paramètres" subtitle="Personnalise ton expérience" />

      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard>
          <h3 className="text-lg font-semibold mb-2">Thème</h3>
          <p className="text-sm text-muted-foreground">Mode sombre activé par défaut (DA du jeu).</p>
          <div className="mt-4">
            <ActionButton>Changer le thème</ActionButton>
          </div>
        </SectionCard>

        <SectionCard>
          <h3 className="text-lg font-semibold mb-2">Comptes connectés</h3>
          <p className="text-sm text-muted-foreground">Spotify lié. Tu peux te déconnecter à tout moment.</p>
          <div className="mt-4">
            <ActionButton>Déconnexion Spotify</ActionButton>
          </div>
        </SectionCard>
      </div>
    </main>
  )
}
