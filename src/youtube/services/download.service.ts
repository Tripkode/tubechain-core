import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { VideoFormatService } from './video-format.service';
import * as path from 'path';
import { FileUtilityService } from './utility.service';
import { YtDlpCommandService } from './yt-dlp.service';
import { VideoUrlService } from './url.service';
import { VideoInfoService } from './info.service';
import { DownloadResponse } from '../interfaces/video-info.interface';

@Injectable()
export class YoutubeDownloadService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;

  constructor(
    private readonly videoUrlService: VideoUrlService,
    private readonly videoInfoService: VideoInfoService,
    private readonly videoFormatService: VideoFormatService,
    private readonly ytDlpCommandService: YtDlpCommandService,
    private readonly fileUtilityService: FileUtilityService
  ) {}

  /**
   * Delay utility para reintentos
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Descarga un video de YouTube
   */
  async downloadVideo(url: string): Promise<DownloadResponse> {
    let lastError: Error | undefined = undefined;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`\n🔄 INTENTO ${attempt}/${this.MAX_RETRIES}`);

        const videoId = this.videoUrlService.extractVideoId(url);
        console.log(`📺 Video ID: ${videoId}`);

        // Obtener información del video
        const videoInfo = await this.videoInfoService.getVideoInfo(url);

        // Verificar disponibilidad
        this.videoInfoService.validateVideoAvailability(videoInfo);

        // Seleccionar mejor formato
        const formatSelector = this.videoFormatService.selectBestFormat(videoInfo.formats || []);
        console.log(`🎯 Selector de formato: ${formatSelector}`);

        // Configurar nombre de archivo
        const outputTemplate = `${videoId}_%(format_id)s.%(ext)s`;

        // Construir comando de descarga
        const sanitizedUrl = this.videoUrlService.sanitizeUrl(url);
        const downloadCommand = this.ytDlpCommandService.buildDownloadCommand(
          sanitizedUrl, 
          formatSelector, 
          outputTemplate
        );

        console.log('🔽 Iniciando descarga...');

        // Realizar descarga
        await this.ytDlpCommandService.executeYtDlp(downloadCommand, this.fileUtilityService.getTempDir());

        // Buscar el archivo descargado
        const files = this.fileUtilityService.findDownloadedFiles(videoId);

        if (files.length === 0) {
          throw new Error('No se encontró el archivo descargado');
        }

        const downloadedFile = files[0];
        const filePath = path.join(this.fileUtilityService.getTempDir(), downloadedFile);

        // Verificar que el archivo existe y tiene contenido
        const fileValidation = this.fileUtilityService.validateFile(filePath);
        if (!fileValidation.exists) {
          throw new Error('El archivo descargado no existe');
        }
        if (!fileValidation.hasContent) {
          throw new Error('El archivo descargado está vacío');
        }

        // Leer archivo como buffer
        const buffer = this.fileUtilityService.readFileAsBuffer(filePath);

        // Limpiar archivo temporal
        this.fileUtilityService.deleteFile(filePath);

        if (!buffer || buffer.length === 0) {
          throw new Error('Buffer de descarga vacío');
        }

        // Procesar información del video
        const videoInfoResponse = this.videoInfoService.processVideoInfo(videoInfo, videoId, buffer.length);

        const filename = this.fileUtilityService.sanitizeFilename(
          `${videoInfoResponse.title}_${videoInfoResponse.quality}.${videoInfoResponse.format}`
        );

        const response: DownloadResponse = {
          success: true,
          videoInfo: videoInfoResponse,
          downloadBuffer: buffer,
          contentType: this.videoFormatService.getContentType(videoInfoResponse.format),
          filename,
        };

        const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
        console.log(`\n✅ DESCARGA EXITOSA`);
        console.log(`📁 Archivo: ${filename}`);
        console.log(`📏 Tamaño: ${fileSizeMB} MB`);
        console.log(`🎯 Calidad: ${videoInfoResponse.quality}`);
        console.log(`📹 Formato: ${videoInfoResponse.format}`);

        return response;

      } catch (error) {
        lastError = error;
        console.error(`❌ Error en intento ${attempt}: ${error.message}`);

        if (error instanceof BadRequestException) {
          throw error;
        }

        if (attempt < this.MAX_RETRIES) {
          const delayTime = this.RETRY_DELAY * attempt;
          console.log(`⏳ Esperando ${delayTime}ms antes del siguiente intento...`);
          await this.delay(delayTime);
        }
      }
    }

    throw new InternalServerErrorException(
      `Error descargando el video después de ${this.MAX_RETRIES} intentos: ${lastError?.message || 'Error desconocido'}`
    );
  }
}