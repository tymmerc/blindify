export {}

declare global {
  interface Window {
    Spotify?: SpotifySdk;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }

  type SpotifySdk = {
    Player: new (options: {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    }) => SpotifyPlayer;
  };

  type SpotifyPlayer = {
    connect: () => Promise<boolean>;
    disconnect: () => Promise<void> | void;
    addListener: (event: string, cb: (...args: any[]) => void) => SpotifyPlayer;
    removeListener: (event: string) => SpotifyPlayer;
  };
}
