export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  duration: number;
  durationFormatted: string;
  thumbnail: string;
  author: {
    name: string;
    channelId: string;
  };
  viewCount: number;
  uploadDate: string;
  quality: string;
  format: string;
  fileSize?: number;
}

export interface DownloadResponse {
  success: boolean;
  videoInfo: VideoInfo;
  downloadBuffer: Buffer;
  contentType: string;
  filename: string;
}