import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class YtDlpCommandService {
  private readonly YTDLP_TIMEOUT = 300000; // 5 minutos timeout
  private readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

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

      // Si el error es de bot detection, sugerir soluciones
      if (error.message.includes('Sign in to confirm you\'re not a bot')) {
        throw new Error(`Bot detection error: ${error.message}. Try using cookies or different user agent.`);
      }

      throw new Error(`Error ejecutando yt-dlp: ${error.message}`);
    }
  }

  /**
   * Construye el comando para obtener información del video con opciones anti-bot
   */
  buildInfoCommand(url: string, options?: {
    useCookies?: boolean;
    cookiesFile?: string;
    userAgent?: string;
    useProxy?: boolean;
    proxyUrl?: string;
  }): string {
    let command = 'yt-dlp -j --no-check-certificate --no-warnings';

    // Agregar user agent aleatorio
    const userAgent = options?.userAgent || this.getRandomUserAgent();
    command += ` --user-agent "${userAgent}"`;

    // Agregar cookies si están disponibles
    if (options?.useCookies && options?.cookiesFile) {
      command += ` --cookies "${options.cookiesFile}"`;
    }

    // Agregar proxy si está configurado
    if (options?.useProxy && options?.proxyUrl) {
      command += ` --proxy "${options.proxyUrl}"`;
    }

    // Opciones adicionales para evitar detección
    command += ' --sleep-interval 1';
    command += ' --max-sleep-interval 3';
    command += ' --extractor-retries 3';
    command += ' --fragment-retries 3';
    command += ' --retry-sleep linear=1::2';

    command += ` "${url}"`;

    return command;
  }

  /**
   * Construye el comando para obtener información usando cookies del navegador
   */
  buildInfoCommandWithBrowserCookies(url: string, browser: 'chrome' | 'firefox' | 'edge' | 'safari' = 'chrome'): string {
    let command = 'yt-dlp -j --no-check-certificate --no-warnings';
    command += ` --cookies-from-browser ${browser}`;
    command += ` --user-agent "${this.getRandomUserAgent()}"`;
    command += ' --sleep-interval 1';
    command += ' --max-sleep-interval 3';
    command += ` "${url}"`;

    return command;
  }

  /**
   * Construye el comando para descargar el video
   */
  buildDownloadCommand(url: string, formatSelector: string, outputTemplate: string, options?: {
    useCookies?: boolean;
    cookiesFile?: string;
    userAgent?: string;
  }): string {
    let command = `yt-dlp -f "${formatSelector}" -o "${outputTemplate}" --no-check-certificate --no-warnings --prefer-free-formats`;

    // Agregar user agent
    const userAgent = options?.userAgent || this.getRandomUserAgent();
    command += ` --user-agent "${userAgent}"`;

    // Agregar cookies si están disponibles
    if (options?.useCookies && options?.cookiesFile) {
      command += ` --cookies "${options.cookiesFile}"`;
    }

    // Opciones adicionales para evitar detección
    command += ' --sleep-interval 1';
    command += ' --max-sleep-interval 3';

    command += ` "${url}"`;

    return command;
  }

  /**
   * Intenta obtener información del video con múltiples estrategias
   */
  async getVideoInfoWithFallback(url: string, workingDir: string): Promise<string> {
    const strategies = [
      // Estrategia 1: Con cookies del navegador Chrome
      async () => {
        const command = this.buildInfoCommandWithBrowserCookies(url, 'chrome');
        return await this.executeYtDlp(command, workingDir);
      },

      // Estrategia 2: Con cookies del navegador Firefox
      async () => {
        const command = this.buildInfoCommandWithBrowserCookies(url, 'firefox');
        return await this.executeYtDlp(command, workingDir);
      },

      // Estrategia 3: Con user agent personalizado y delays
      async () => {
        const command = this.buildInfoCommand(url, {
          userAgent: this.getRandomUserAgent()
        });
        return await this.executeYtDlp(command, workingDir);
      },

      // Estrategia 4: Con archivo de cookies si existe
      async () => {
        const cookiesPath = path.join(workingDir, 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
          const command = this.buildInfoCommand(url, {
            useCookies: true,
            cookiesFile: cookiesPath
          });
          return await this.executeYtDlp(command, workingDir);
        }
        throw new Error('No cookies file found');
      }
    ];

    let lastError: Error = new Error('All strategies failed');

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`🔄 Intentando estrategia ${i + 1}...`);
        const result = await strategies[i]();
        console.log(`✅ Estrategia ${i + 1} exitosa`);
        return result;
      } catch (error) {
        console.warn(`❌ Estrategia ${i + 1} falló:`, error.message);
        lastError = error;

        // Esperar un poco antes del siguiente intento
        if (i < strategies.length - 1) {
          await this.sleep(2000);
        }
      }
    }

    throw lastError;
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

  /**
   * Actualiza yt-dlp a la última versión
   */
  async updateYtDlp(): Promise<string> {
    try {
      const command = 'yt-dlp -U';
      const result = await execAsync(command);
      return result.stdout.trim();
    } catch (error) {
      throw new Error(`Error actualizando yt-dlp: ${error.message}`);
    }
  }

  /**
   * Crea un archivo de cookies de ejemplo
   */
  async createSampleCookiesFile(filePath: string): Promise<void> {
    const sampleCookies = `# Netscape HTTP Cookie File
      # This is a generated file! Do not edit.

      # Para obtener cookies reales:
      # 1. Ve a YouTube en tu navegador
      # 2. Inicia sesión si es necesario
      # 3. Usa una extensión como "Get cookies.txt" para exportar las cookies
      # 4. Reemplaza este archivo con las cookies reales

      .youtube.com	TRUE	/	FALSE	0	VISITOR_INFO1_LIVE	sample_value
      .youtube.com	TRUE	/	FALSE	0	YSC	sample_value
    `;

    fs.writeFileSync(filePath, sampleCookies);
  }

  /**
   * Obtiene un user agent aleatorio
   */
  private getRandomUserAgent(): string {
    return this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
  }

  /**
   * Función de utilidad para esperar
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extrae el ID del video de YouTube de una URL
   */
  extractVideoId(url: string): string | null {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Verifica si una URL es de YouTube
   */
  isYouTubeUrl(url: string): boolean {
    return /(?:youtube\.com|youtu\.be)/.test(url);
  }
}