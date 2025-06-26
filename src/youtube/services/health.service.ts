import { Injectable } from '@nestjs/common';
import { YtDlpCommandService } from './yt-dlp.service';
import { FileUtilityService } from './utility.service';

@Injectable()
export class YoutubeHealthService {
  constructor(
    private readonly ytDlpCommandService: YtDlpCommandService,
    private readonly fileUtilityService: FileUtilityService
  ) {}

  /**
   * Verifica el estado de salud del servicio
   */
  async healthCheck(): Promise<{
    status: string;
    version?: string;
    backend?: string;
    error?: string;
    tempDirExists?: boolean;
    ytDlpInstalled?: boolean;
  }> {
    try {
      // Verificar que yt-dlp esté disponible
      const isInstalled = await this.ytDlpCommandService.checkInstallation();
      
      if (!isInstalled) {
        return {
          status: 'ERROR',
          backend: 'yt-dlp nativo',
          error: 'yt-dlp no está instalado',
          ytDlpInstalled: false
        };
      }

      const version = await this.ytDlpCommandService.getVersion();
      
      return {
        status: 'OK',
        version: version,
        backend: 'yt-dlp nativo',
        tempDirExists: true,
        ytDlpInstalled: true
      };
    } catch (error) {
      console.error('Health check failed:', error.message);
      return {
        status: 'ERROR',
        backend: 'yt-dlp nativo',
        error: error.message,
        ytDlpInstalled: false
      };
    }
  }

  /**
   * Verifica si yt-dlp está instalado
   */
  async checkYtDlpInstallation(): Promise<boolean> {
    return await this.ytDlpCommandService.checkInstallation();
  }

  /**
   * Ejecuta limpieza de archivos temporales
   */
  async cleanupTempFiles(): Promise<void> {
    await this.fileUtilityService.cleanTempFiles();
  }

  /**
   * Obtiene estadísticas del servicio
   */
  async getServiceStats(): Promise<{
    tempDirPath: string;
    ytDlpVersion?: string;
    isYtDlpInstalled: boolean;
  }> {
    const isInstalled = await this.ytDlpCommandService.checkInstallation();
    let version: string | undefined;

    if (isInstalled) {
      try {
        version = await this.ytDlpCommandService.getVersion();
      } catch (error) {
        console.warn('No se pudo obtener la versión de yt-dlp:', error.message);
      }
    }

    return {
      tempDirPath: this.fileUtilityService.getTempDir(),
      ytDlpVersion: version,
      isYtDlpInstalled: isInstalled
    };
  }

  /**
   * Verifica la conectividad con YouTube
   */
  async checkYouTubeConnectivity(): Promise<{
    isConnected: boolean;
    error?: string;
    responseTime?: number;
  }> {
    try {
      const startTime = Date.now();
      
      // Intentar obtener información de un video de prueba (video público de YouTube)
      const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll como video de prueba
      const command = this.ytDlpCommandService.buildInfoCommand(testUrl);
      
      await this.ytDlpCommandService.executeYtDlp(command, process.cwd());
      
      const responseTime = Date.now() - startTime;
      
      return {
        isConnected: true,
        responseTime
      };
    } catch (error) {
      console.error('Error verificando conectividad con YouTube:', error.message);
      return {
        isConnected: false,
        error: error.message
      };
    }
  }

  /**
   * Ejecuta un diagnóstico completo del servicio
   */
  async fullDiagnostic(): Promise<{
    overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    checks: {
      ytDlpInstalled: boolean;
      tempDirExists: boolean;
      youtubeConnectivity: boolean;
      version?: string;
    };
    details: {
      tempDirPath?: string;
      connectivityResponseTime?: number;
      errors: string[];
    };
  }> {
    const errors: string[] = [];
    let healthyChecks = 0;
    const totalChecks = 3;

    // Verificar instalación de yt-dlp
    const isInstalled = await this.checkYtDlpInstallation();
    if (isInstalled) healthyChecks++;
    else errors.push('yt-dlp no está instalado');

    // Verificar directorio temporal
    let tempDirExists = false;
    let tempDirPath: string | undefined;
    try {
      tempDirPath = this.fileUtilityService.getTempDir();
      this.fileUtilityService.ensureTempDir();
      // Assuming ensureTempDir throws on failure, so if no error, it exists
      tempDirExists = true;
      healthyChecks++;
    } catch (error) {
      errors.push(`Error con directorio temporal: ${error.message}`);
    }

    // Verificar conectividad con YouTube
    const connectivity = await this.checkYouTubeConnectivity();
    if (connectivity.isConnected) healthyChecks++;
    else errors.push(`Error de conectividad: ${connectivity.error}`);

    // Obtener versión si está instalado
    let version: string | undefined;
    if (isInstalled) {
      try {
        version = await this.ytDlpCommandService.getVersion();
      } catch (error) {
        errors.push(`Error obteniendo versión: ${error.message}`);
      }
    }

    // Determinar estado general
    let overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    if (healthyChecks === totalChecks) {
      overall = 'HEALTHY';
    } else if (healthyChecks >= 1) {
      overall = 'DEGRADED';
    } else {
      overall = 'UNHEALTHY';
    }

    return {
      overall,
      checks: {
        ytDlpInstalled: isInstalled,
        tempDirExists,
        youtubeConnectivity: connectivity.isConnected,
        version
      },
      details: {
        tempDirPath,
        connectivityResponseTime: connectivity.responseTime,
        errors
      }
    };
  }

  /**
   * Intenta reparar problemas comunes
   */
  async attemptRepair(): Promise<{
    success: boolean;
    actionsPerformed: string[];
    remainingIssues: string[];
  }> {
    const actionsPerformed: string[] = [];
    const remainingIssues: string[] = [];

    try {
      // Limpiar archivos temporales
      await this.cleanupTempFiles();
      actionsPerformed.push('Limpieza de archivos temporales');

      // Verificar y crear directorio temporal
      try {
        this.fileUtilityService.ensureTempDir();
        actionsPerformed.push('Verificación/creación de directorio temporal');
      } catch (error) {
        remainingIssues.push('No se pudo crear el directorio temporal');
      }

      // Verificar instalación de yt-dlp
      const isInstalled = await this.checkYtDlpInstallation();
      if (!isInstalled) {
        remainingIssues.push('yt-dlp no está instalado - requiere instalación manual');
      } else {
        actionsPerformed.push('Verificación de instalación de yt-dlp');
      }

    } catch (error) {
      remainingIssues.push(`Error durante la reparación: ${error.message}`);
    }

    return {
      success: remainingIssues.length === 0,
      actionsPerformed,
      remainingIssues
    };
  }
}