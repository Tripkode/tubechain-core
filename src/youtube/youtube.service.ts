import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { VideoInfo, DownloadResponse } from './interfaces/video-info.interface';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class YoutubeService {
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;
  private readonly TEMP_DIR = path.join(process.cwd(), 'temp');
  private readonly YTDLP_TIMEOUT = 300000; // 5 minutos timeout

  constructor() {
    this.ensureTempDir();
  }

  private ensureTempDir(): void {
    if (!fs.existsSync(this.TEMP_DIR)) {
      fs.mkdirSync(this.TEMP_DIR, { recursive: true });
    }
  }

  private extractVideoId(url: string): string {
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

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^\w\s-\.]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100);
  }

  private sanitizeForHeader(str: string): string {
    if (!str) return '';
    return str
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/"/g, "'")
      .trim()
      .substring(0, 200);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private parseYoutubeDlDuration(duration: string | number): number {
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

  private escapeShellArg(arg: string): string {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  private async executeYtDlp(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.YTDLP_TIMEOUT,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        cwd: this.TEMP_DIR
      });

      if (stderr && !stderr.includes('WARNING')) {
        console.warn('yt-dlp stderr:', stderr);
      }

      return stdout;
    } catch (error) {
      console.error('Error ejecutando yt-dlp:', error.message);
      throw new Error(`Error ejecutando yt-dlp: ${error.message}`);
    }
  }

  private async getVideoInfo(url: string): Promise<any> {
    try {
      console.log('🔍 Obteniendo información del video...');

      const escapedUrl = this.escapeShellArg(url);
      const command = `yt-dlp -j --no-check-certificate --no-warnings ${escapedUrl}`;

      const stdout = await this.executeYtDlp(command);

      if (!stdout.trim()) {
        throw new Error('No se pudo obtener información del video');
      }

      const info = JSON.parse(stdout.trim());

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

  private selectBestFormat(formats: any[]): string {
    const hdCombined = formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.height >= 720);

    if (hdCombined.length) return hdCombined[0].format_id;

    const sdCombined = formats.filter(f =>
      f.vcodec !== 'none' && f.acodec !== 'none' && f.height < 720
    );

    if (sdCombined.length) return sdCombined[0].format_id;

    if (!formats || formats.length === 0) {
      return 'best[ext=mp4]'; // Formato por defecto
    }

    console.log(`📊 Analizando ${formats.length} formatos disponibles`);

    const preferredCodecs = ['vp09', 'av01', 'avc1'];

    // Buscar formatos con video y audio (legacy)
    const combinedFormats = formats.filter(f =>
      f.vcodec !== 'none' && f.acodec !== 'none' &&
      (f.ext === 'mp4' || f.container === 'mp4')
    );

    if (combinedFormats.length > 0) {
      const best = combinedFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
      console.log(`✅ Formato seleccionado: ${best.format_id} (${best.height}p, con audio)`);
      return best.format_id;
    }

    // Si no hay formatos combinados, usar formato adaptativo
    const videoFormats = formats.filter(f =>
      f.vcodec !== 'none' && (f.ext === 'mp4' || f.container === 'mp4')
    );

    if (videoFormats.length > 0) {
      const bestVideo = videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
      console.log(`⚠️ Formato seleccionado: ${bestVideo.format_id} (${bestVideo.height}p, video+audio por separado)`);
      return `${bestVideo.format_id}+bestaudio[ext=m4a]/best[ext=mp4]`;
    }

    // Fallback a mejor calidad disponible
    console.log('⚠️ Usando formato por defecto');
    return 'best[ext=mp4]/best';
  }

  async downloadVideo(url: string): Promise<DownloadResponse> {
    let lastError: Error | undefined = undefined;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`\n🔄 INTENTO ${attempt}/${this.MAX_RETRIES}`);

        const videoId = this.extractVideoId(url);
        console.log(`📺 Video ID: ${videoId}`);

        // Obtener información del video
        const videoInfo = await this.getVideoInfo(url);

        // Verificar disponibilidad
        if (videoInfo.availability && videoInfo.availability !== 'public') {
          throw new BadRequestException(`Video no disponible: ${videoInfo.availability}`);
        }

        // Seleccionar mejor formato
        const formatSelector = this.selectBestFormat(videoInfo.formats || []);
        console.log(`🎯 Selector de formato: ${formatSelector}`);

        // Configurar nombre de archivo
        const outputTemplate = `${videoId}_%(format_id)s.%(ext)s`;

        // Escapar argumentos para shell
        const escapedUrl = this.escapeShellArg(url);
        const escapedFormat = this.escapeShellArg(formatSelector);
        const escapedOutput = this.escapeShellArg(outputTemplate);

        // Construir comando de descarga
        const downloadCommand = `yt-dlp -f ${escapedFormat} -o ${escapedOutput} --no-check-certificate --no-warnings --prefer-free-formats ${escapedUrl}`;

        console.log('🔽 Iniciando descarga...');

        // Realizar descarga
        await this.executeYtDlp(downloadCommand);

        // Buscar el archivo descargado
        const files = fs.readdirSync(this.TEMP_DIR).filter(file =>
          file.startsWith(videoId) && (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
        );

        if (files.length === 0) {
          throw new Error('No se encontró el archivo descargado');
        }

        const downloadedFile = files[0];
        const filePath = path.join(this.TEMP_DIR, downloadedFile);

        // Verificar que el archivo existe y tiene contenido
        if (!fs.existsSync(filePath)) {
          throw new Error('El archivo descargado no existe');
        }

        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          throw new Error('El archivo descargado está vacío');
        }

        // Leer archivo como buffer
        const buffer = fs.readFileSync(filePath);

        // Limpiar archivo temporal
        fs.unlinkSync(filePath);

        if (!buffer || buffer.length === 0) {
          throw new Error('Buffer de descarga vacío');
        }

        // Procesar información del video
        const duration = this.parseYoutubeDlDuration(videoInfo.duration);

        const videoInfoResponse: VideoInfo = {
          id: videoInfo.id || videoId,
          title: this.sanitizeForHeader(videoInfo.title || 'Sin título'),
          description: this.sanitizeForHeader(videoInfo.description || 'Sin descripción'),
          duration: duration,
          durationFormatted: this.formatDuration(duration),
          thumbnail: videoInfo.thumbnail || videoInfo.thumbnails?.[0]?.url || '',
          author: {
            name: this.sanitizeForHeader(videoInfo.uploader || videoInfo.channel || 'Desconocido'),
            channelId: videoInfo.channel_id || videoInfo.uploader_id || '',
          },
          viewCount: videoInfo.view_count || 0,
          uploadDate: videoInfo.upload_date
            ? new Date(videoInfo.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toISOString()
            : new Date().toISOString(),
          quality: videoInfo.height ? `${videoInfo.height}p` : 'Mejor disponible',
          format: videoInfo.ext || 'mp4',
          fileSize: buffer.length,
        };

        const filename = this.sanitizeFilename(
          `${videoInfoResponse.title}_${videoInfoResponse.quality}.${videoInfoResponse.format}`
        );

        const response: DownloadResponse = {
          success: true,
          videoInfo: videoInfoResponse,
          downloadBuffer: buffer,
          contentType: `video/${videoInfoResponse.format}`,
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

  async healthCheck(): Promise<{ status: string; version?: string; backend?: string; error?: string }> {
    try {
      // Verificar que yt-dlp esté disponible
      const stdout = await this.executeYtDlp('yt-dlp --version');
      return {
        status: 'OK',
        version: stdout.trim(),
        backend: 'yt-dlp nativo'
      };
    } catch (error) {
      console.error('Health check failed:', error.message);
      return {
        status: 'ERROR',
        backend: 'yt-dlp nativo',
        error: error.message
      };
    }
  }

  // Método para limpiar archivos temporales antiguos
  async cleanTempFiles(): Promise<void> {
    try {
      const files = fs.readdirSync(this.TEMP_DIR);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.TEMP_DIR, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtime.getTime() > oneHour) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Archivo temporal eliminado: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error limpiando archivos temporales:', error.message);
    }
  }

  // Método para verificar si yt-dlp está instalado
  async checkYtDlpInstallation(): Promise<boolean> {
    try {
      await this.executeYtDlp('which yt-dlp');
      return true;
    } catch (error) {
      console.error('yt-dlp no está instalado o no está en el PATH');
      return false;
    }
  }
}