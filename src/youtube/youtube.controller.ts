import {
  Controller,
  Post,
  Body,
  Res,
  HttpStatus,
  Get,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiProduces,
} from '@nestjs/swagger';
import { YoutubeService } from './youtube.service';
import { DownloadVideoDto } from './dto/download-video.dto';

@ApiTags('youtube')
@Controller('youtube')
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) { }

  @Get('health')
  @ApiOperation({
    summary: 'Verificar estado del servicio',
    description: 'Endpoint para verificar que el servicio está funcionando correctamente'
  })
  @ApiResponse({
    status: 200,
    description: 'Servicio funcionando correctamente',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        service: { type: 'string', example: 'YouTube Downloader API' },
        timestamp: { type: 'string', example: '2025-01-01T00:00:00.000Z' }
      }
    }
  })
  healthCheck() {
    return {
      status: 'ok',
      service: 'YouTube Downloader API',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('download')
  @ApiOperation({
    summary: 'Descargar video de YouTube',
    description: 'Descarga un video de YouTube en la mejor calidad disponible usando la URL proporcionada',
  })
  @ApiBody({
    type: DownloadVideoDto,
    description: 'URL del video de YouTube a descargar',
  })
  @ApiResponse({
    status: 200,
    description: 'Video descargado exitosamente',
    content: {
      'video/mp4': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
    headers: {
      'Content-Disposition': {
        description: 'Nombre del archivo para descarga',
        schema: {
          type: 'string',
          example: 'attachment; filename="video_title_1080p.mp4"',
        },
      },
      'Content-Type': {
        description: 'Tipo de contenido del archivo',
        schema: {
          type: 'string',
          example: 'video/mp4',
        },
      },
      'Content-Length': {
        description: 'Tamaño del archivo en bytes',
        schema: {
          type: 'string',
          example: '50000000',
        },
      },
      'X-Video-Info': {
        description: 'Información del video en formato JSON',
        schema: {
          type: 'string',
          example: '{"title":"Video Title","duration":"3:45","quality":"1080p"}',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'URL inválida o no se pudo procesar el video',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'La URL debe ser un enlace válido de YouTube' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Error interno del servidor',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 500 },
        message: { type: 'string', example: 'Error descargando el video' },
        error: { type: 'string', example: 'Internal Server Error' },
      },
    },
  })
  @ApiProduces('video/mp4')
  async downloadVideo(
    @Body() downloadVideoDto: DownloadVideoDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const result = await this.youtubeService.downloadVideo(downloadVideoDto.url);

      // Configurar headers para la descarga
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.downloadBuffer.length);

      // Header personalizado con información del video
      res.setHeader('X-Video-Info', JSON.stringify({
        title: result.videoInfo.title,
        duration: result.videoInfo.durationFormatted,
        quality: result.videoInfo.quality,
        author: result.videoInfo.author.name,
        viewCount: result.videoInfo.viewCount,
        fileSize: result.videoInfo.fileSize,
      }));

      // Enviar el buffer como respuesta
      res.status(HttpStatus.OK).send(result.downloadBuffer);

    } catch (error) {
      console.error('Error en el controlador:', error);

      if (!res.headersSent) {
        res.status(error.status || HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || 'Error descargando el video',
          error: error.name || 'Internal Server Error',
        });
      }
    }
  }
}