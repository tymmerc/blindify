"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import PageHeader from "@/components/ui/PageHeader";
import { publicPath } from "@/lib/publicPath";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 bg-background/50 border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        <PageHeader
          title="Comment ça marche"
          subtitle="4 étapes simples pour lancer ton blindtest personnalisé"
        />

        <div className="space-y-24">
          {/* Étape 1 */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <h3 className="text-2xl font-bold mb-3">1. Connecte ton compte Spotify</h3>
              <p className="text-muted-foreground">
                Blindify utilise tes titres likés et tes playlists pour créer une expérience adaptée à tes goûts.
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <Image
                src={publicPath("/user-registration-modern-interface.jpg")}
                alt="Connexion utilisateur"
                width={600}
                height={400}
                className="rounded-2xl shadow-lg border border-border"
                priority
              />
            </motion.div>
          </div>

          {/* Étape 2 */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <Image
                src={publicPath("/music-playlist-selection-interface.jpg")}
                alt="Sélection playlist"
                width={600}
                height={400}
                className="rounded-2xl shadow-lg border border-border"
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <h3 className="text-2xl font-bold mb-3">2. Choisis ta playlist</h3>
              <p className="text-muted-foreground">
                Utilise tes playlists, tes titres likés ou un mix auto. L’IA évite les répétitions entre manches.
              </p>
            </motion.div>
          </div>

          {/* Étape 3 */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <h3 className="text-2xl font-bold mb-3">3. Invite tes amis</h3>
              <p className="text-muted-foreground">
                Crée une room, partage le code et affrontez-vous en direct. Mode host façon Kahoot disponible.
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <Image
                src={publicPath("/friends-invitation-social-sharing.jpg")}
                alt="Partage avec des amis"
                width={600}
                height={400}
                className="rounded-2xl shadow-lg border border-border"
              />
            </motion.div>
          </div>

          {/* Étape 4 */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <Image
                src={publicPath("/game-winner-celebration-trophy.jpg")}
                alt="Victoire"
                width={600}
                height={400}
                className="rounded-2xl shadow-lg border border-border"
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
              <h3 className="text-2xl font-bold mb-3">4. Score & podium</h3>
              <p className="text-muted-foreground">
                Classement final, stats de manche et historique de progression. Qui sera n°1 ?
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
