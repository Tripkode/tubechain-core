import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Innertube } from 'youtubei.js';
import { VideoInfo, DownloadResponse } from './interfaces/video-info.interface';

@Injectable()
export class YoutubeService {
  private youtube: Innertube;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000;

  // Pool de configuraciones para rotar y evitar detección
  private readonly CLIENT_CONFIGS = [
    {
      lang: 'en',
      location: 'US',
      client_name: 'WEB',
      client_version: '2.20241205.07.00'
    },
    {
      lang: 'es',
      location: 'ES',
      client_name: 'WEB',
      client_version: '2.20241205.07.00'
    },
    {
      lang: 'en',
      location: 'GB',
      client_name: 'ANDROID',
      client_version: '19.50.45'
    }
  ];

  private currentConfigIndex = 0;

  constructor() {
    this.initializeYoutube();
  }

  private getNextConfig() {
    const config = this.CLIENT_CONFIGS[this.currentConfigIndex];
    this.currentConfigIndex = (this.currentConfigIndex + 1) % this.CLIENT_CONFIGS.length;
    return config;
  }

  private async initializeYoutube(): Promise<void> {
    try {
      const config = this.getNextConfig();
      
      // Inicialización simple sin fetch personalizado para evitar errores de headers
      this.youtube = await Innertube.create({
        lang: config.lang,
        location: config.location,
        enable_session_cache: false
      });
      
      console.log(`YouTube client inicializado con configuración: ${config.client_name} ${config.location}`);
    } catch (error) {
      console.error('Error inicializando YouTube client:', error);
      throw new InternalServerErrorException('Error inicializando el servicio de YouTube');
    }
  }

  private async retryInitialization(): Promise<void> {
    console.log('Reintentando inicialización del cliente YouTube con nueva configuración...');
    await this.initializeYoutube();
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

  private parseDuration(durationText: string): number {
    if (!durationText) return 0;

    const match = durationText.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private selectBestFormat(formats: any[]): any {
    if (!formats || formats.length === 0) {
      throw new BadRequestException('No hay formatos disponibles');
    }

    // Filtrar formatos de video válidos con audio (formato completo)
    let videoFormats = formats.filter(format => {
      const isVideoWithAudio = format.mime_type?.includes('video/mp4') && 
                              format.has_video && 
                              format.has_audio &&
                              (format.url || format.signatureCipher);
      return isVideoWithAudio;
    });

    // Si no hay formatos con audio, buscar solo video
    if (videoFormats.length === 0) {
      videoFormats = formats.filter(format => {
        const isVideo = format.mime_type?.includes('video/mp4') && 
                       format.has_video !== false &&
                       (format.url || format.signatureCipher);
        return isVideo;
      });
    }

    if (videoFormats.length === 0) {
      throw new BadRequestException('No se encontraron formatos de video compatibles');
    }

    // Ordenar por calidad (MAYOR a MENOR)
    const sortedFormats = videoFormats.sort((a, b) => {
      // Prioridad 1: Resolución
      const heightA = a.height || 0;
      const heightB = b.height || 0;
      if (heightA !== heightB) {
        return heightB - heightA; // Mayor resolución primero
      }

      // Prioridad 2: Bitrate
      const bitrateA = a.bitrate || 0;
      const bitrateB = b.bitrate || 0;
      if (bitrateA !== bitrateB) {
        return bitrateB - bitrateA;
      }

      // Prioridad 3: FPS
      const fpsA = a.fps || 0;
      const fpsB = b.fps || 0;
      return fpsB - fpsA;
    });

    console.log(`\n=== FORMATOS DISPONIBLES (${sortedFormats.length}) ===`);
    sortedFormats.forEach((format, index) => {
      const quality = format.quality_label || `${format.height}p` || 'N/A';
      const hasAudio = format.has_audio ? '🔊' : '🔇';
      const bitrate = format.bitrate ? `${Math.round(format.bitrate / 1000)}kbps` : 'N/A';
      console.log(`${index + 1}. ${quality} ${hasAudio} - ${bitrate} - ${format.mime_type}`);
    });

    const bestFormat = sortedFormats[0];
    const selectedQuality = bestFormat.quality_label || `${bestFormat.height}p` || 'Desconocida';
    console.log(`\n✅ SELECCIONADO: ${selectedQuality} (${bestFormat.mime_type})`);
    
    return bestFormat;
  }

  // Método mejorado para obtener información del video con múltiples intentos
  private async getVideoInfo(videoId: string): Promise<any> {
    const methods = [
      () => this.youtube.getBasicInfo(videoId),
      () => this.youtube.getInfo(videoId),
    ];

    for (const method of methods) {
      try {
        const info = await method();
        if (info) return info;
      } catch (error) {
        console.log(`Método de información falló: ${error.message}`);
      }
    }

    throw new BadRequestException('No se pudo obtener información del video');
  }

  async downloadVideo(url: string): Promise<DownloadResponse> {
    let lastError: Error | undefined = undefined;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`\n🔄 INTENTO ${attempt}/${this.MAX_RETRIES}`);

        if (!this.youtube) {
          await this.initializeYoutube();
        }

        const videoId = this.extractVideoId(url);
        console.log(`📺 Video ID: ${videoId}`);

        // Obtener información del video
        const videoInfo = await this.getVideoInfo(videoId);

        // Verificar disponibilidad
        if (videoInfo.playability_status?.status === 'UNPLAYABLE') {
          throw new BadRequestException(
            `Video no disponible: ${videoInfo.playability_status.reason || 'Razón desconocida'}`
          );
        }

        // Obtener formatos
        const adaptiveFormats = videoInfo.streaming_data?.adaptive_formats || [];
        const legacyFormats = videoInfo.streaming_data?.formats || [];
        const allFormats = [...legacyFormats, ...adaptiveFormats]; // Priorizar formatos legacy (con audio)

        if (allFormats.length === 0) {
          throw new BadRequestException('No se encontraron formatos de descarga');
        }

        console.log(`📊 Total de formatos: ${allFormats.length}`);

        // Seleccionar mejor formato
        const bestFormat = this.selectBestFormat(allFormats);

        // Descargar usando múltiples métodos
        let buffer: Buffer;
        let downloadMethod = 'Desconocido';

        try {
          // Método 1: Descarga integrada de youtubei.js
          console.log('\n🔽 Método 1: Descarga integrada...');
          const stream = await this.youtube.download(videoId, {
            type: 'video+audio', // Priorizar video con audio
            quality: 'best',
            format: 'mp4'
          });

          const chunks: Buffer[] = [];
          const reader = stream.getReader();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(Buffer.from(value));
            }
          }

          buffer = Buffer.concat(chunks);
          downloadMethod = 'Integrada';
          
        } catch (downloadError) {
          console.log(`❌ Método 1 falló: ${downloadError.message}`);
          
          // Método 2: Descarga directa con URL
          if (bestFormat.url) {
            console.log('🔽 Método 2: Descarga directa...');
            
            // Headers mínimos para evitar problemas
            const response = await fetch(bestFormat.url, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.youtube.com/',
                'Origin': 'https://www.youtube.com'
              }
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            downloadMethod = 'Directa';
            
          } else {
            throw new Error('No hay URL de descarga disponible');
          }
        }

        if (!buffer || buffer.length === 0) {
          throw new Error('Buffer de descarga vacío');
        }

        // Procesar información del video
        const basicInfo = videoInfo.basic_info || {};
        const durationRaw = basicInfo.duration;
        const durationSeconds = typeof durationRaw === 'number'
          ? durationRaw
          : this.parseDuration(typeof durationRaw === 'string' ? durationRaw : '0');

        const videoInfoResponse: VideoInfo = {
          id: basicInfo.id || videoId,
          title: this.sanitizeForHeader(basicInfo.title || 'Sin título'),
          description: this.sanitizeForHeader(basicInfo.short_description || 'Sin descripción'),
          duration: durationSeconds,
          durationFormatted: this.formatDuration(durationSeconds),
          thumbnail: basicInfo.thumbnail?.[0]?.url || '',
          author: {
            name: this.sanitizeForHeader(basicInfo.author || 'Desconocido'),
            channelId: basicInfo.channel_id || '',
          },
          viewCount: basicInfo.view_count || 0,
          uploadDate: basicInfo.start_timestamp?.toISOString() || 
                     basicInfo.end_timestamp?.toISOString() || 
                     new Date().toISOString(),
          quality: bestFormat.quality_label || `${bestFormat.height}p` || 'Mejor disponible',
          format: 'mp4',
          fileSize: buffer.length,
        };

        const filename = this.sanitizeFilename(
          `${videoInfoResponse.title}_${videoInfoResponse.quality}.mp4`
        );

        const response: DownloadResponse = {
          success: true,
          videoInfo: videoInfoResponse,
          downloadBuffer: buffer,
          contentType: 'video/mp4',
          filename,
        };

        const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
        console.log(`\n✅ DESCARGA EXITOSA`);
        console.log(`📁 Archivo: ${filename}`);
        console.log(`📏 Tamaño: ${fileSizeMB} MB`);
        console.log(`🔧 Método: ${downloadMethod}`);
        console.log(`🎯 Calidad: ${videoInfoResponse.quality}`);
        
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
          
          // Reinicializar con nueva configuración
          try {
            await this.retryInitialization();
          } catch (reinitError) {
            console.error('Error reinicializando:', reinitError.message);
          }
        }
      }
    }

    throw new InternalServerErrorException(
      `Error descargando el video después de ${this.MAX_RETRIES} intentos: ${lastError?.message || 'Error desconocido'}`
    );
  }

  async healthCheck(): Promise<{ status: string; version?: string; config?: string }> {
    try {
      if (!this.youtube) {
        await this.initializeYoutube();
      }
      const currentConfig = this.CLIENT_CONFIGS[this.currentConfigIndex];
      return { 
        status: 'OK', 
        version: '14.0.0',
        config: `${currentConfig.client_name}-${currentConfig.location}`
      };
    } catch (error) {
      return { status: 'ERROR' };
    }
  }
}