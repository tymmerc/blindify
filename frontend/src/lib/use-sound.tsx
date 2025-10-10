"use client"

import { useCallback, useRef } from "react"

type SoundType = "click" | "correct" | "wrong" | "gameOver" | "tick"

export function useSound() {
  const audioContextRef = useRef<AudioContext | null>(null)

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AudioContextClass) {
        audioContextRef.current = new AudioContextClass()
      }
    }
    return audioContextRef.current
  }, [])

  const playSound = useCallback(
    (type: SoundType) => {
      const ctx = getAudioContext()
      if (!ctx) return

      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      switch (type) {
        case "click":
          oscillator.frequency.value = 800
          gainNode.gain.setValueAtTime(0.1, ctx.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
          oscillator.start(ctx.currentTime)
          oscillator.stop(ctx.currentTime + 0.1)
          break

        case "correct":
          oscillator.frequency.value = 523.25
          gainNode.gain.setValueAtTime(0.2, ctx.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
          oscillator.start(ctx.currentTime)
          oscillator.stop(ctx.currentTime + 0.3)
          setTimeout(() => {
            const osc2 = ctx.createOscillator()
            const gain2 = ctx.createGain()
            osc2.connect(gain2)
            gain2.connect(ctx.destination)
            osc2.frequency.value = 659.25
            gain2.gain.setValueAtTime(0.2, ctx.currentTime)
            gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
            osc2.start(ctx.currentTime)
            osc2.stop(ctx.currentTime + 0.3)
          }, 100)
          break

        case "wrong":
          oscillator.frequency.value = 200
          gainNode.gain.setValueAtTime(0.2, ctx.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
          oscillator.start(ctx.currentTime)
          oscillator.stop(ctx.currentTime + 0.4)
          break

        case "gameOver":
          const frequencies = [523.25, 493.88, 440, 392]
          frequencies.forEach((freq, index) => {
            setTimeout(() => {
              const osc = ctx.createOscillator()
              const gain = ctx.createGain()
              osc.connect(gain)
              gain.connect(ctx.destination)
              osc.frequency.value = freq
              gain.gain.setValueAtTime(0.15, ctx.currentTime)
              gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
              osc.start(ctx.currentTime)
              osc.stop(ctx.currentTime + 0.5)
            }, index * 150)
          })
          break

        case "tick":
          oscillator.frequency.value = 1000
          gainNode.gain.setValueAtTime(0.05, ctx.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05)
          oscillator.start(ctx.currentTime)
          oscillator.stop(ctx.currentTime + 0.05)
          break
      }
    },
    [getAudioContext],
  )

  return { playSound }
}
