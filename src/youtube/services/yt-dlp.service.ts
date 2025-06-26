import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class YtDlpCommandService {
  private readonly YTDLP_TIMEOUT = 300000; // 5 minutos timeout

  /**
   * Escapa argumentos para el shell de manera segura
   */
  private escapeShellArg(arg: string): string {
    // En Windows, usar comillas dobles y escapar las comillas internas
    if (process.platform === 'win32') {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    // En Unix/Linux, usar el método estándar
    return `'${arg.replace(/'/g, "'\"'\"'")}'`;
  }

  /**
   * Ejecuta un comando de yt-dlp de manera segura
   */
  async executeYtDlp(command: string, workingDir: string): Promise<string> {
    try {
      console.log('🔧 Ejecutando comando:', command);

      const { stdout, stderr } = await execAsync(command, {
        timeout: this.YTDLP_TIMEOUT,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        cwd: workingDir,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
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

  /**
   * Construye el comando para obtener información del video
   */
  buildInfoCommand(url: string): string {
    return `yt-dlp -j --no-check-certificate --no-warnings "${url}"`;
  }

  /**
   * Construye el comando para descargar el video
   */
  buildDownloadCommand(url: string, formatSelector: string, outputTemplate: string): string {
    return `yt-dlp -f "${formatSelector}" -o "${outputTemplate}" --no-check-certificate --no-warnings --prefer-free-formats "${url}"`;
  }

  /**
   * Construye el comando para verificar la versión
   */
  buildVersionCommand(): string {
    return 'yt-dlp --version';
  }

  /**
   * Construye el comando para verificar la instalación
   */
  buildCheckInstallationCommand(): string {
    return process.platform === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
  }

  /**
   * Verifica si yt-dlp está instalado
   */
  async checkInstallation(): Promise<boolean> {
    try {
      const command = this.buildCheckInstallationCommand();
      await execAsync(command);
      return true;
    } catch (error) {
      console.error('yt-dlp no está instalado o no está en el PATH');
      return false;
    }
  }

  /**
   * Obtiene la versión de yt-dlp
   */
  async getVersion(): Promise<string> {
    const command = this.buildVersionCommand();
    const result = await execAsync(command);
    return result.stdout.trim();
  }
}