import { Injectable } from '@nestjs/common';

@Injectable()
export class VideoFormatService {

  /**
   * Selecciona el mejor formato disponible basado en calidad y compatibilidad
   */
  selectBestFormat(formats: any[]): string {
    if (!formats || formats.length === 0) {
      return 'best[ext=mp4]'; // Formato por defecto
    }

    console.log(`📊 Analizando ${formats.length} formatos disponibles`);

    // Buscar formatos HD combinados (video + audio)
    const hdCombined = formats.filter(f => 
      f.vcodec !== 'none' && 
      f.acodec !== 'none' && 
      f.height >= 720 &&
      (f.ext === 'mp4' || f.container === 'mp4')
    );

    if (hdCombined.length) {
      const best = hdCombined.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
      console.log(`✅ Formato HD seleccionado: ${best.format_id} (${best.height}p, con audio)`);
      return best.format_id;
    }

    // Buscar formatos SD combinados
    const sdCombined = formats.filter(f =>
      f.vcodec !== 'none' && 
      f.acodec !== 'none' && 
      f.height < 720 &&
      (f.ext === 'mp4' || f.container === 'mp4')
    );

    if (sdCombined.length) {
      const best = sdCombined.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
      console.log(`✅ Formato SD seleccionado: ${best.format_id} (${best.height}p, con audio)`);
      return best.format_id;
    }

    // Buscar formatos con video y audio (cualquier contenedor)
    const combinedFormats = formats.filter(f =>
      f.vcodec !== 'none' && f.acodec !== 'none'
    );

    if (combinedFormats.length > 0) {
      const best = combinedFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
      console.log(`✅ Formato combinado seleccionado: ${best.format_id} (${best.height}p, con audio)`);
      return best.format_id;
    }

    // Si no hay formatos combinados, usar formato adaptativo
    const videoFormats = formats.filter(f =>
      f.vcodec !== 'none' && (f.ext === 'mp4' || f.container === 'mp4')
    );

    if (videoFormats.length > 0) {
      const bestVideo = videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
      console.log(`⚠️ Formato adaptativo seleccionado: ${bestVideo.format_id} (${bestVideo.height}p, video+audio por separado)`);
      return `${bestVideo.format_id}+bestaudio[ext=m4a]/best[ext=mp4]`;
    }

    // Fallback a mejor calidad disponible
    console.log('⚠️ Usando formato por defecto');
    return 'best[ext=mp4]/best';
  }

  /**
   * Parsea la duración de diferentes formatos
   */
  parseYoutubeDlDuration(duration: string | number): number {
    if (typeof duration === 'number') {
      return duration;
    }

    if (!duration) return 0;

    // Formato: "PT4M33S" o "4:33" o números
    if (typeof duration === 'string') {
      // Formato ISO 8601 (PT4M33S)
      const isoMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (isoMatch) {
        const hours = parseInt(isoMatch[1] || '0', 10);
        const minutes = parseInt(isoMatch[2] || '0', 10);
        const seconds = parseInt(isoMatch[3] || '0', 10);
        return hours * 3600 + minutes * 60 + seconds;
      }

      // Formato MM:SS o HH:MM:SS
      const timeMatch = duration.match(/^(?:(\d+):)?(\d+):(\d+)$/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1] || '0', 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseInt(timeMatch[3], 10);
        return hours * 3600 + minutes * 60 + seconds;
      }

      // Si es un número como string
      const numMatch = duration.match(/^\d+$/);
      if (numMatch) {
        return parseInt(duration, 10);
      }
    }

    return 0;
  }

  /**
   * Formatea la duración en segundos a formato HH:MM:SS o MM:SS
   */
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Determina el tipo de contenido basado en la extensión
   */
  getContentType(format: string): string {
    const contentTypes: { [key: string]: string } = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mkv': 'video/x-matroska',
      'avi': 'video/x-msvideo',
      'mov': 'video/quicktime',
      'flv': 'video/x-flv'
    };

    return contentTypes[format.toLowerCase()] || 'video/mp4';
  }
}