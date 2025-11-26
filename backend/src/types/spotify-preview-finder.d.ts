declare module "spotify-preview-finder" {
  type FinderResult = {
    success: boolean;
    searchQuery?: string;
    results?: Array<{
      name: string;
      spotifyUrl?: string;
      previewUrls?: string[];
      trackId?: string;
      albumName?: string;
      releaseDate?: string;
      popularity?: number;
      durationMs?: number;
    }>;
    error?: string;
  };

  export default function spotifyPreviewFinder(
    songName: string,
    artistOrLimit?: string | number,
    limit?: number
  ): Promise<FinderResult>;
}
