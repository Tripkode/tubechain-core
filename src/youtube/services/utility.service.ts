import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FileUtilityService {
  private readonly TEMP_DIR = path.join(process.cwd(), 'temp');

  constructor() {
    this.ensureTempDir();
  }

  /**
   * Asegura que el directorio temporal exista
   */
  ensureTempDir(): void {
    if (!fs.existsSync(this.TEMP_DIR)) {
      fs.mkdirSync(this.TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Sanitiza un nombre de archivo
   */
  sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^\w\s-\.]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100);
  }

  /**
   * Sanitiza una cadena para usar en headers HTTP
   */
  sanitizeForHeader(str: string): string {
    if (!str) return '';
    return str
      .replace(/[\r\n\t]/g, ' ')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/"/g, "'")
      .trim()
      .substring(0, 200);
  }

  /**
   * Obtiene el directorio temporal
   */
  getTempDir(): string {
    return this.TEMP_DIR;
  }

  /**
   * Busca archivos descargados por ID de video
   */
  findDownloadedFiles(videoId: string): string[] {
    const files = fs.readdirSync(this.TEMP_DIR).filter(file =>
      file.startsWith(videoId) && (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
    );
    return files;
  }

  /**
   * Verifica si un archivo existe y tiene contenido
   */
  validateFile(filePath: string): { exists: boolean; hasContent: boolean; size: number } {
    if (!fs.existsSync(filePath)) {
      return { exists: false, hasContent: false, size: 0 };
    }

    const stats = fs.statSync(filePath);
    return {
      exists: true,
      hasContent: stats.size > 0,
      size: stats.size
    };
  }

  /**
   * Lee un archivo como buffer
   */
  readFileAsBuffer(filePath: string): Buffer {
    return fs.readFileSync(filePath);
  }

  /**
   * Elimina un archivo
   */
  deleteFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Limpia archivos temporales antiguos (más de 1 hora)
   */
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
}