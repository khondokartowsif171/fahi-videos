export interface VideoFormat {
  itag: number;
  qualityLabel: string;
  container: string;
  hasVideo: boolean;
  hasAudio: boolean;
  contentLength?: string;
  url: string;
  mimeType: string;
  bitrate?: number;
  audioBitrate?: number;
}

export interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  channel: string;
  viewCount?: string;
  formats: VideoFormat[];
}

export type FetchState = 'idle' | 'loading' | 'ready' | 'error';
