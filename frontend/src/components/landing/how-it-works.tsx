"use client";

import { motion } from "framer-motion";
import PageHeader from "@/components/ui/PageHeader";
import SectionCard from "@/components/ui/SectionCard";

const steps = [
  {
    number: "01",
    title: "Connecte ton compte Spotify",
    description:
      "Blindify utilise tes titres likes et tes playlists pour creer une experience adaptee a tes gouts.",
  },
  {
    number: "02",
    title: "Choisis ta playlist",
    description:
      "Utilise tes playlists, tes titres likes ou un mix auto. L'IA evite les repetitions entre manches.",
  },
  {
    number: "03",
    title: "Invite tes amis",
    description:
      "Cree une room, partage le code et affrontez-vous en direct. Mode host facon Kahoot disponible.",
  },
  {
    number: "04",
    title: "Score & podium",
    description:
      "Classement final, stats de manche et historique de progression. Qui sera n\u00b01 ?",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 border-t-2 border-[#2e2014] bg-[#ece1c8]">
      <div className="max-w-7xl mx-auto px-6">
        <PageHeader
          title="Comment ca marche"
          subtitle="4 etapes simples pour lancer ton blindtest personnalise"
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <SectionCard className="p-8 h-full flex flex-col items-start gap-4 bg-[#f4ecdb] transition-all duration-300">
                <span className="font-display text-4xl font-bold text-[#c65133]">
                  {step.number}
                </span>
                <h3 className="font-display text-lg font-semibold text-[#2e2014]">
                  {step.title}
                </h3>
                <p className="text-[#6b573f] leading-relaxed text-sm">
                  {step.description}
                </p>
              </SectionCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
