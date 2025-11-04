"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Moon, Sun, Music, LogOut, Bell, Globe, Shield, Trash2 } from "lucide-react"
import PageHeader from "@/components/ui/PageHeader"

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(true)
  const [notifications, setNotifications] = useState(true)

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-green-50 dark:from-gray-950 dark:via-purple-950 dark:to-gray-950">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <PageHeader title="Paramètres" subtitle="Personnalise ton expérience" />

        <div className="space-y-6">
          {/* Apparence */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {darkMode ? (
                  <Moon className="w-6 h-6 text-purple-600" />
                ) : (
                  <Sun className="w-6 h-6 text-yellow-500" />
                )}
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Thème</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Mode {darkMode ? "sombre" : "clair"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  darkMode ? "bg-purple-600" : "bg-gray-300"
                }`}
              >
                <div
                  className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-transform ${
                    darkMode ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Le mode sombre est activé par défaut pour matcher la DA rose/violet/vert du jeu.
            </p>
          </motion.div>

          {/* Notifications */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Bell className="w-6 h-6 text-pink-600" />
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Notifications</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Alertes et rappels de parties
                  </p>
                </div>
              </div>
              <button
                onClick={() => setNotifications(!notifications)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  notifications ? "bg-pink-600" : "bg-gray-300"
                }`}
              >
                <div
                  className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-transform ${
                    notifications ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </motion.div>

          {/* Compte Spotify */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-start gap-3 mb-4">
              <Music className="w-6 h-6 text-green-500" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Spotify</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Compte connecté • user@example.com
                </p>
                <button className="px-6 py-3 rounded-full border-2 border-red-500 text-red-500 font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  Déconnecter Spotify
                </button>
              </div>
            </div>
          </motion.div>

          {/* Langue */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-start gap-3">
              <Globe className="w-6 h-6 text-blue-600" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Langue</h3>
                <select className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:border-purple-600 focus:outline-none transition-colors">
                  <option>Français 🇫🇷</option>
                  <option>English 🇬🇧</option>
                  <option>Español 🇪🇸</option>
                </select>
              </div>
            </div>
          </motion.div>

          {/* Confidentialité */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
          >
            <div className="flex items-start gap-3 mb-4">
              <Shield className="w-6 h-6 text-purple-600" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Confidentialité</h3>
                <div className="space-y-3">
                  <button className="w-full px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-700 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-left">
                    Voir les données collectées
                  </button>
                  <button className="w-full px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-700 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all text-left">
                    Politique de confidentialité
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Zone dangereuse */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="p-6 rounded-2xl bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800"
          >
            <div className="flex items-start gap-3">
              <Trash2 className="w-6 h-6 text-red-600" />
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-900 dark:text-red-100 mb-2">
                  Zone dangereuse
                </h3>
                <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                  Cette action est irréversible. Toutes tes données seront définitivement supprimées.
                </p>
                <button className="px-6 py-3 rounded-full bg-red-600 text-white font-bold hover:bg-red-700 transition-all">
                  Supprimer mon compte
                </button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Blindify v1.0.0 • Made with ♪ for music lovers</p>
        </div>
      </div>
    </div>
  )
}