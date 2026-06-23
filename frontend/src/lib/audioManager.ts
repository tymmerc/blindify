export type AudioOwner = "multiplayer" | "solo" | "ui" | string;

export type AudioState = {
  owner: AudioOwner | null;
  src: string | null;
  playing: boolean;
  muted: boolean;
  volume: number;
  lastStopReason: string | null;
};

export const DEFAULT_AUDIO_VOLUME = 0.35;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUDIO_VOLUME;
  return Math.min(1, Math.max(0, value));
}

class AudioManager {
  private audio: HTMLAudioElement | null = null;
  private owner: AudioOwner | null = null;
  private muted = false;
  private volume = DEFAULT_AUDIO_VOLUME;
  private lastStopReason: string | null = null;
  private listeners = new Set<(state: AudioState) => void>();
  private handlers: Array<[keyof HTMLMediaElementEventMap, EventListener]> = [];

  getState(): AudioState {
    const active = Boolean(this.audio && !this.audio.paused && !this.audio.ended);
    return {
      owner: this.owner,
      src: this.audio?.src ?? null,
      playing: active,
      muted: this.muted,
      volume: this.volume,
      lastStopReason: this.lastStopReason,
    };
  }

  subscribe(callback: (state: AudioState) => void): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private emit(reason?: string): void {
    if (reason) {
      this.lastStopReason = reason;
    }
    const snapshot = this.getState();
    this.listeners.forEach(listener => listener(snapshot));
  }

  private detach(): void {
    if (this.audio) {
      this.handlers.forEach(([event, handler]) => this.audio?.removeEventListener(event, handler));
    }
    this.handlers = [];
  }

  private bindLifecycle(owner?: AudioOwner | null): void {
    if (!this.audio) return;
    this.detach();
    const onPlay = () => this.emit("play");
    const onPause = () => this.emit("pause");
    const onEnded = () => {
      if (!owner || owner === this.owner) {
        this.emit("ended");
      }
    };
    this.handlers = [
      ["play", onPlay],
      ["pause", onPause],
      ["ended", onEnded],
    ];
    this.handlers.forEach(([event, handler]) => this.audio?.addEventListener(event, handler));
  }

  private applyVolume(): void {
    if (this.audio) {
      this.audio.volume = this.muted ? 0 : this.volume;
    }
  }

  getCurrent(owner?: AudioOwner): HTMLAudioElement | null {
    if (owner && this.owner && owner !== this.owner) return null;
    return this.audio;
  }

  /**
   * Pre-create the Audio element during a user interaction (click/tap).
   * This unlocks the browser autoplay policy so later programmatic play() works.
   * Call this on "Lancer la partie" click, before the socket round:start arrives.
   */
  warmup(): void {
    if (typeof Audio === "undefined") return;
    if (!this.audio) {
      this.audio = new Audio();
    }
    // Play a silent buffer to unlock autoplay
    const WARM = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    this.audio.src = WARM;
    this.audio.volume = 0;
    this.audio.play().then(() => {
      // Ne PAS clobber si un vrai morceau a pris la main entre-temps (race warmup/play).
      if (this.audio && this.audio.src.startsWith("data:audio/wav")) {
        this.audio.pause();
        this.audio.src = "";
      }
    }).catch(() => {});
  }

  async play(options: { src: string; loop?: boolean; volume?: number; owner?: AudioOwner; seekTo?: number }): Promise<HTMLAudioElement | null> {
    if (typeof Audio === "undefined") return null;

    // CRITIQUE : on REUTILISE le meme element audio. Une fois debloque par un geste
    // (warmup au clic "Lancer"/au 1er tap), il reste autorise a jouer SANS nouvelle
    // interaction pour toutes les manches suivantes. L'ancien code faisait stop()->null->
    // new Audio() a chaque play : l'element fraichement debloque etait jete -> autoplay
    // re-bloque -> overlay "cliquer pour lancer" a chaque manche.
    if (!this.audio) {
      this.audio = new Audio();
    }
    this.detach();
    try { this.audio.pause(); } catch { /* ignore */ }

    this.owner = options.owner ?? null;
    this.audio.loop = options.loop ?? false;
    this.volume = clampVolume(options.volume ?? this.volume);
    this.applyVolume();
    this.audio.src = options.src;
    try { this.audio.currentTime = 0; } catch { /* ignore */ }
    this.bindLifecycle(this.owner);

    try {
      await this.audio.play();
      // Seek to position for sync (e.g. joining a round already in progress)
      if (options.seekTo != null && options.seekTo > 0 && isFinite(options.seekTo)) {
        this.audio.currentTime = options.seekTo;
      }
      this.emit("play");
      return this.audio;
    } catch (err) {
      // NE PAS detruire l'element : il reste debloque pour un retry immediat.
      this.emit("error");
      throw err;
    }
  }

  pause(owner?: AudioOwner): void {
    if (owner && this.owner && owner !== this.owner) return;
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        // ignore pause errors
      }
      this.emit("pause");
    }
  }

  resume(owner?: AudioOwner): void {
    if (owner && this.owner && owner !== this.owner) return;
    if (!this.audio) return;
    this.applyVolume();
    this.audio
      .play()
      .then(() => this.emit("play"))
      .catch(() => this.emit("error"));
  }

  stop(reason = "manual", owner?: AudioOwner): void {
    if (owner && this.owner && owner !== this.owner) return;
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = "";
      } catch {
        // ignore cleanup errors
      }
    }
    this.detach();
    // On GARDE l'element audio (deja debloque par un geste) : le mettre a null forcerait
    // un new Audio() non-debloque au prochain play -> autoplay re-bloque entre les manches.
    this.owner = null;
    this.emit(reason);
  }

  setMuted(next: boolean, owner?: AudioOwner): void {
    if (owner && this.owner && owner !== this.owner) return;
    this.muted = next;
    this.applyVolume();
    this.emit("muted");
  }

  setVolume(value: number, owner?: AudioOwner): void {
    if (owner && this.owner && owner !== this.owner) return;
    this.volume = clampVolume(value);
    this.applyVolume();
    this.emit("volume");
  }
}

export const audioManager = new AudioManager();

// --- Audio feedback (Web Audio API for lightweight SFX) ---
let feedbackCtx: AudioContext | null = null;

function getFeedbackCtx(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!feedbackCtx || feedbackCtx.state === "closed") {
    feedbackCtx = new AudioContext();
  }
  if (feedbackCtx.state === "suspended") {
    feedbackCtx.resume().catch(() => {});
  }
  return feedbackCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume = 0.15) {
  const ctx = getFeedbackCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export function playCorrectSound() {
  playTone(523, 0.15, "sine", 0.12);
  setTimeout(() => playTone(784, 0.25, "sine", 0.14), 100);
}

export function playPartialSound() {
  playTone(440, 0.2, "triangle", 0.1);
}

export function playWrongSound() {
  playTone(220, 0.2, "sawtooth", 0.08);
}
