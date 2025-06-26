import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';

const execAsync = promisify(exec);

@Injectable()
export class YtDlpCommandService implements OnModuleDestroy {
  private readonly YTDLP_TIMEOUT = 300000; // 5 minutos timeout
  private readonly BROWSER_TIMEOUT = 60000; // 1 minuto para operaciones del navegador
  private readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0'
  ];

  private browser: puppeteer.Browser | null = null;

  /**
   * Inicializa el navegador con configuración anti-detección avanzada
   */
  private async initBrowser(): Promise<puppeteer.Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    console.log('🚀 Inicializando navegador con configuración anti-detección...');
    
    this.browser = await puppeteer.launch({
      headless: true, // Usar el modo headless
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-default-browser-check',
        '--no-first-run',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-translate',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--disable-component-extensions-with-background-pages',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-client-side-phishing-detection',
        '--disable-sync',
        '--disable-prompt-on-repost',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-domain-reliability',
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-features=VizDisplayCompositor',
        '--disable-features=ChromeWhatsNewUI',
        '--disable-features=ChromeLabs',
        '--user-agent=' + this.getRandomUserAgent(),
        '--window-size=1920,1080'
      ],
      timeout: this.BROWSER_TIMEOUT,
      protocolTimeout: this.BROWSER_TIMEOUT,
      defaultViewport: { width: 1920, height: 1080 }
    });

    return this.browser;
  }

  /**
   * Configura una página con características anti-detección
   */
  private async setupStealthPage(page: puppeteer.Page): Promise<void> {
    // Configurar viewport y user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(this.getRandomUserAgent());

    // Configurar headers adicionales
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    });

    // Eliminar propiedades que indican automatización
    await page.evaluateOnNewDocument(() => {
      // Eliminar webdriver
      delete (window.navigator as any).webdriver;
      
      // Sobrescribir la propiedad de plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      // Sobrescribir la propiedad de languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'es']
      });

      // Sobrescribir webGL vendor y renderer
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Google Inc. (NVIDIA)';
        }
        if (parameter === 37446) {
          return 'NVIDIA GeForce GTX 1080 Ti';
        }
        return getParameter.call(this, parameter);
      };

      // Sobrescribir permissions
      const originalQuery = navigator.permissions.query;
      navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({
              state: Notification.permission,
              name: 'notifications',
              onchange: null,
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => false
            } as PermissionStatus)
          : originalQuery(parameters)
      );

      // Modificar el objeto chrome
      if (!(window as any).chrome) {
        (window as any).chrome = {};
      }
      (window as any).chrome.runtime = {
        onConnect: null,
        onMessage: null,
        onInstalled: null
      };
    });
  }

  /**
   * Obtiene cookies de YouTube usando Puppeteer con anti-detección
   */
  async getCookiesWithStealth(url: string): Promise<puppeteer.Protocol.Network.Cookie[]> {
    const browser = await this.initBrowser();
    let page: puppeteer.Page | null = null;

    try {
      page = await browser.newPage();
      await this.setupStealthPage(page);

      console.log('🌐 Navegando a YouTube...');
      
      // Navegar a YouTube primero para establecer cookies básicas
      await page.goto('https://www.youtube.com', { 
        waitUntil: 'networkidle2',
        timeout: this.BROWSER_TIMEOUT 
      });

      // Esperar un poco para simular comportamiento humano
      await this.sleep(this.randomDelay(2000, 4000));

      // Interactuar con la página para parecer más humano
      await this.simulateHumanInteraction(page);

      // Navegar a la URL específica del video
      console.log('📹 Navegando al video...');
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: this.BROWSER_TIMEOUT 
      });

      // Simular más interacciones humanas
      await this.simulateVideoPageInteraction(page);

      // Obtener cookies
      const cookies = await page.cookies();
      console.log(`🍪 Obtenidas ${cookies.length} cookies`);

      return this.formatCookiesForProtocol(cookies);
    } catch (error) {
      console.error('Error obteniendo cookies con anti-detección:', error.message);
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Simula interacciones humanas en la página principal de YouTube
   */
  private async simulateHumanInteraction(page: puppeteer.Page): Promise<void> {
    try {
      // Scroll aleatorio suave
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight / 4) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      await this.sleep(this.randomDelay(1000, 2000));

      // Mover el mouse de forma natural
      await this.naturalMouseMovement(page);

      // Intentar hacer hover sobre algunos elementos
      try {
        const videoElements = await page.$$('ytd-video-renderer, ytd-rich-item-renderer');
        if (videoElements.length > 0) {
          const randomElement = videoElements[Math.floor(Math.random() * Math.min(3, videoElements.length))];
          await randomElement.hover();
          await this.sleep(this.randomDelay(500, 1500));
        }
      } catch (e) {
        // Ignorar errores de hover
      }

    } catch (error) {
      console.warn('Error simulando interacciones humanas:', error.message);
    }
  }

  /**
   * Simula interacciones específicas en la página del video
   */
  private async simulateVideoPageInteraction(page: puppeteer.Page): Promise<void> {
    try {
      // Esperar a que el video se cargue
      await page.waitForSelector('video', { timeout: 10000 }).catch(() => {});

      // Scroll suave hacia abajo
      await page.evaluate(() => {
        window.scrollBy(0, Math.random() * 300 + 200);
      });

      await this.sleep(this.randomDelay(1000, 2000));

      // Mover mouse hacia el área del video
      try {
        const videoElement = await page.$('video');
        if (videoElement) {
          const box = await videoElement.boundingBox();
          if (box) {
            await page.mouse.move(
              box.x + box.width / 2 + (Math.random() - 0.5) * 100,
              box.y + box.height / 2 + (Math.random() - 0.5) * 100,
              { steps: 10 }
            );
          }
        }
      } catch (e) {
        // Ignorar errores
      }

      await this.sleep(this.randomDelay(1000, 2000));

      // Scroll hacia los comentarios
      await page.evaluate(() => {
        window.scrollBy(0, Math.random() * 400 + 300);
      });

      await this.sleep(this.randomDelay(500, 1500));

    } catch (error) {
      console.warn('Error simulando interacciones del video:', error.message);
    }
  }

  /**
   * Simula movimiento natural del mouse
   */
  private async naturalMouseMovement(page: puppeteer.Page): Promise<void> {
    const viewport = page.viewport();
    if (!viewport) return;

    const startX = Math.random() * viewport.width;
    const startY = Math.random() * viewport.height;
    const endX = Math.random() * viewport.width;
    const endY = Math.random() * viewport.height;

    await page.mouse.move(startX, startY);
    await page.mouse.move(endX, endY, { steps: 10 });
  }

  /**
   * Formatea cookies para el protocolo
   */
  private formatCookiesForProtocol(cookies: puppeteer.Cookie[]): puppeteer.Protocol.Network.Cookie[] {
    return cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires || -1,
      size: cookie.name.length + cookie.value.length,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      session: !cookie.expires,
      sameSite: (cookie.sameSite as any) || 'None',
      priority: 'Medium' as const,
      sameParty: false,
      sourceScheme: 'Secure' as const,
      sourcePort: 443
    }));
  }

  /**
   * Convierte cookies a formato Netscape
   */
  private convertCookiesToNetscapeFormat(cookies: puppeteer.Protocol.Network.Cookie[]): string {
    const lines = ['# Netscape HTTP Cookie File'];
    
    for (const cookie of cookies) {
      const domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain;
      const flag = cookie.domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const path = cookie.path || '/';
      const secure = cookie.secure ? 'TRUE' : 'FALSE';
      const expiration = cookie.expires && cookie.expires > 0 ? Math.floor(cookie.expires) : '0';
      
      lines.push(`${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${cookie.name}\t${cookie.value}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Guarda cookies en formato Netscape
   */
  async saveCookiesFile(cookies: puppeteer.Protocol.Network.Cookie[], filePath: string): Promise<void> {
    const cookiesContent = this.convertCookiesToNetscapeFormat(cookies);
    fs.writeFileSync(filePath, cookiesContent);
    console.log(`💾 Cookies guardadas en: ${filePath}`);
  }

  /**
   * Obtiene información del video usando Puppeteer con anti-detección
   */
  async getVideoInfoWithStealth(url: string, workingDir: string): Promise<string> {
    console.log('🔒 Obteniendo información con anti-detección...');
    
    try {
      // Obtener cookies usando anti-detección
      const cookies = await this.getCookiesWithStealth(url);
      
      // Guardar cookies en archivo temporal
      const cookiesPath = path.join(workingDir, 'stealth_cookies.txt');
      await this.saveCookiesFile(cookies, cookiesPath);
      
      // Intentar obtener información con las cookies obtenidas
      const command = this.buildInfoCommand(url, {
        useCookies: true,
        cookiesFile: cookiesPath,
        userAgent: this.getRandomUserAgent()
      });
      
      const result = await this.executeYtDlp(command, workingDir);
      
      // Limpiar archivo de cookies temporal
      try {
        fs.unlinkSync(cookiesPath);
      } catch (e) {
        console.warn('No se pudo eliminar el archivo de cookies temporal');
      }
      
      return result;
    } catch (error) {
      console.error('Error con anti-detección:', error.message);
      throw error;
    }
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

      // Si el error es de bot detection, sugerir usar anti-detección
      if (error.message.includes('Sign in to confirm you\'re not a bot') ||
          error.message.includes('blocked') ||
          error.message.includes('429') ||
          error.message.includes('captcha')) {
        throw new Error(`Bot detection error: ${error.message}. Using anti-detection fallback.`);
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

    // Opciones adicionales para evitar detección (actualizadas para 2025)
    command += ' --sleep-interval 1';
    command += ' --max-sleep-interval 5';
    command += ' --extractor-retries 5';
    command += ' --fragment-retries 5';
    command += ' --retry-sleep linear=1::3';
    command += ' --http-chunk-size 10485760'; // 10MB chunks
    command += ' --socket-timeout 30';
    command += ' --retries 3';

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
    command += ' --max-sleep-interval 5';
    command += ' --extractor-retries 5';
    command += ' --socket-timeout 30';
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
    command += ' --max-sleep-interval 5';
    command += ' --http-chunk-size 10485760';
    command += ' --socket-timeout 30';

    command += ` "${url}"`;

    return command;
  }

  /**
   * Intenta obtener información del video con múltiples estrategias incluyendo anti-detección
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
      },

      // Estrategia 5: Usando Puppeteer con anti-detección
      async () => {
        return await this.getVideoInfoWithStealth(url, workingDir);
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

        // Esperar un poco antes del siguiente intento con delay aleatorio
        if (i < strategies.length - 1) {
          const delay = this.randomDelay(2000, 5000);
          await this.sleep(delay);
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
   * Obtiene un user agent aleatorio actualizado para 2025
   */
  private getRandomUserAgent(): string {
    return this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
  }

  /**
   * Genera un delay aleatorio entre min y max milisegundos
   */
  private randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

  /**
   * Cierra el navegador al destruir el servicio
   */
  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Navegador cerrado');
    }
  }
}