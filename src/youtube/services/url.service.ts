import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class VideoUrlService {
  
  /**
   * Extrae el ID del video de una URL de YouTube
   */
  extractVideoId(url: string): string {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    throw new BadRequestException('No se pudo extraer el ID del video de la URL proporcionada');
  }

  /**
   * Sanitiza una URL verificando que sea válida y segura
   */
  sanitizeUrl(url: string): string {
    const urlRegex = /^https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;
    if (!urlRegex.test(url)) {
      throw new BadRequestException('URL contiene caracteres no válidos');
    }
    return url;
  }

  /**
   * Valida que la URL sea de YouTube
   */
  validateYouTubeUrl(url: string): boolean {
    const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/;
    return youtubeRegex.test(url);
  }
}