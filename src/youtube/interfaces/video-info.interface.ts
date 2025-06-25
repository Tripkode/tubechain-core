export interface VideoInfo {
  id: string;
  title: string;
  description?: string; // Opcional (puede faltar en algunos casos)
  duration: number; // Duración en segundos
  durationFormatted: string; // Formato "MM:SS"
  thumbnail?: string; // URL de la miniatura principal
  thumbnails?: Array<{ url: string }>; // Lista completa de miniaturas
  author: {
    name: string; // Nombre del canal
    channelId: string; // ID único del canal
  };
  viewCount: number; // Número de vistas
  uploadDate: string; // Fecha de publicación en formato ISO 8601
  quality: string; // Calidad del video (ej: "1080p")
  format: string; // Extensión del archivo (ej: "mp4")
  fileSize?: number; // Tamaño del archivo en bytes
  isLive: boolean; // Indica si es un stream en vivo
  wasLive: boolean; // Indica si fue un stream en vivo
  releaseYear?: number | null; // Año de lanzamiento (si aplica)
}

export interface DownloadResponse {
  success: boolean;
  videoInfo: VideoInfo;
  downloadBuffer: Buffer;
  contentType: string;
  filename: string;
}