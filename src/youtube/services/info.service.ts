import { Injectable, BadRequestException } from '@nestjs/common';
import { VideoInfo } from '../interfaces/video-info.interface';
import { VideoFormatService } from './video-format.service';
import { FileUtilityService } from './utility.service';
import { VideoUrlService } from './url.service';
import { YtDlpCommandService } from './yt-dlp.service';

@Injectable()
export class VideoInfoService {
  
  constructor(
    private readonly ytDlpCommandService: YtDlpCommandService,
    private readonly videoUrlService: VideoUrlService,
    private readonly videoFormatService: VideoFormatService,
    private readonly fileUtilityService: FileUtilityService
  ) {}

  /**
   * Obtiene información detallada del video
   */
  async getVideoInfo(url: string): Promise<any> {
    try {
      console.log('🔍 Obteniendo información del video...');

      const sanitizedUrl = this.videoUrlService.sanitizeUrl(url);
      const command = this.ytDlpCommandService.buildInfoCommand(sanitizedUrl);
      const stdout = await this.ytDlpCommandService.executeYtDlp(command, this.fileUtilityService.getTempDir());

      if (!stdout.trim()) {
        throw new Error('No se pudo obtener información del video');
      }

      const info = JSON.parse(stdout.trim());

      // Asegurar que el formato actual esté en la lista de formatos
      if (info.format_id && !info.formats.some(f => f.format_id === info.format_id)) {
        info.formats.unshift({
          format_id: info.format_id,
          vcodec: info.vcodec,
          acodec: info.acodec,
          ext: info.ext,
          height: info.height,
          container: info.container,
        });
      }

      if (!info) {
        throw new Error('No se pudo parsear la información del video');
      }

      console.log('✅ Información obtenida exitosamente');
      return info;

    } catch (error) {
      console.error('❌ Error obteniendo información:', error.message);
      throw new BadRequestException(`Error obteniendo información del video: ${error.message}`);
    }
  }

  /**
   * Procesa la información del video y la convierte al formato de respuesta
   */
  processVideoInfo(videoInfo: any, videoId: string, bufferSize: number): VideoInfo {
    const duration = this.videoFormatService.parseYoutubeDlDuration(videoInfo.duration);

    return {
      id: videoInfo.id || videoId,
      title: this.fileUtilityService.sanitizeForHeader(videoInfo.title || 'Sin título'),
      description: this.fileUtilityService.sanitizeForHeader(videoInfo.description || 'Sin descripción'),
      duration: duration,
      durationFormatted: this.videoFormatService.formatDuration(duration),
      thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0]?.url || '',
      author: {
        name: this.fileUtilityService.sanitizeForHeader(videoInfo.uploader || videoInfo.channel || 'Desconocido'),
        channelId: videoInfo.channel_id || videoInfo.uploader_id || '',
      },
      viewCount: videoInfo.view_count || 0,
      uploadDate: videoInfo.upload_date
        ? new Date(videoInfo.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toISOString()
        : new Date().toISOString(),
      quality: videoInfo.height ? `${videoInfo.height}p` : 'Mejor disponible',
      format: videoInfo.ext || 'mp4',
      fileSize: bufferSize,
      isLive: typeof videoInfo.is_live === 'boolean' ? videoInfo.is_live : false,
      wasLive: typeof videoInfo.was_live === 'boolean' ? videoInfo.was_live : false,
    };
  }

  /**
   * Valida la disponibilidad del video
   */
  validateVideoAvailability(videoInfo: any): void {
    if (videoInfo.availability && videoInfo.availability !== 'public') {
      throw new BadRequestException(`Video no disponible: ${videoInfo.availability}`);
    }
  }
}