import { Injectable } from '@nestjs/common';
import { DownloadResponse } from './interfaces/video-info.interface';
import { YoutubeDownloadService } from './services/download.service';
import { YoutubeHealthService } from './services/health.service';
import { VideoUrlService } from './services/url.service';
import { VideoInfoService } from './services/info.service';

/**
 * Servicio principal que coordina todas las operaciones de YouTube
 * Actúa como facade para los servicios especializados
 */
@Injectable()
export class YoutubeService {

  constructor(
    private readonly downloadService: YoutubeDownloadService,
    private readonly healthService: YoutubeHealthService,
    private readonly urlService: VideoUrlService,
    private readonly videoInfoService: VideoInfoService
  ) {}

  /**
   * Descarga un video de YouTube
   */
  async downloadVideo(url: string): Promise<DownloadResponse> {
    // Validar URL antes de proceder
    if (!this.urlService.validateYouTubeUrl(url)) {
      throw new Error('La URL proporcionada no es una URL válida de YouTube');
    }

    return await this.downloadService.downloadVideo(url);
  }

  /**
   * Obtiene información de un video sin descargarlo
   */
  async getVideoInfo(url: string): Promise<any> {
    if (!this.urlService.validateYouTubeUrl(url)) {
      throw new Error('La URL proporcionada no es una URL válida de YouTube');
    }

    return await this.videoInfoService.getVideoInfo(url);
  }

  /**
   * Verifica el estado de salud del servicio
   */
  async healthCheck(): Promise<{ status: string; version?: string; backend?: string; error?: string }> {
    return await this.healthService.healthCheck();
  }

  /**
   * Limpia archivos temporales antiguos
   */
  async cleanTempFiles(): Promise<void> {
    await this.healthService.cleanupTempFiles();
  }

  /**
   * Verifica si yt-dlp está instalado
   */
  async checkYtDlpInstallation(): Promise<boolean> {
    return await this.healthService.checkYtDlpInstallation();
  }

  /**
   * Obtiene estadísticas del servicio
   */
  async getServiceStats() {
    return await this.healthService.getServiceStats();
  }

  /**
   * Extrae el ID de un video de YouTube
   */
  extractVideoId(url: string): string {
    return this.urlService.extractVideoId(url);
  }
}