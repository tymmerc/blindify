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
      // Avoid clearing ownership when another component already took over.
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

  async play(options: { src: string; loop?: boolean; volume?: number; owner?: AudioOwner }): Promise<HTMLAudioElement | null> {
    if (typeof Audio === "undefined") return null;

    // Replace any existing source before starting a new one.
    this.stop("preempt");

    if (!this.audio) {
      this.audio = new Audio();
    } else {
      this.detach();
    }

    this.owner = options.owner ?? null;
    this.audio.loop = options.loop ?? false;
    this.volume = clampVolume(options.volume ?? this.volume);
    this.applyVolume();
    this.audio.src = options.src;
    this.bindLifecycle(this.owner);

    try {
      await this.audio.play();
      this.emit("play");
      return this.audio;
    } catch (err) {
      this.stop("error", this.owner ?? undefined);
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
    this.audio = null;
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
