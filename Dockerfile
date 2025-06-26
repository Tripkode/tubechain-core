# Multi-stage build para optimizar tamaño final
FROM node:22-alpine AS builder
WORKDIR /app

# Install build dependencies including Python and yt-dlp requirements
RUN apk add --no-cache \
    python3 \
    py3-pip \
    make \
    g++ \
    ffmpeg \
    && pip3 install --break-system-packages yt-dlp

# Copy dependency files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Verify build output
RUN if [ -f "dist/main.js" ]; then \
      echo "✅ Build exitoso: main.js encontrado"; \
    else \
      echo "❌ ERROR: Build falló - main.js no encontrado" && \
      find dist -name "*.js" | head -10 && \
      exit 1; \
    fi

# Production stage
FROM node:22-alpine AS production
WORKDIR /app

# Install runtime dependencies including yt-dlp and ffmpeg
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    && pip3 install --break-system-packages yt-dlp \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Verify yt-dlp installation
RUN yt-dlp --version && echo "✅ yt-dlp instalado correctamente"

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app
USER nestjs

# Environment configuration
ENV NODE_ENV=production \
    PORT=8080 \
    NPM_CONFIG_CACHE=/tmp/.npm \
    PATH="/usr/local/bin:$PATH"

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Startup script optimizado
RUN echo '#!/bin/sh' > start.sh && \
    echo 'set -e' >> start.sh && \
    echo 'echo "🚀 Iniciando aplicación..."' >> start.sh && \
    echo 'echo "🎬 Verificando yt-dlp..."' >> start.sh && \
    echo 'yt-dlp --version || echo "⚠️ yt-dlp no disponible"' >> start.sh && \
    echo 'echo "🎯 Iniciando servidor NestJS..."' >> start.sh && \
    echo 'exec node dist/src/main.js' >> start.sh && \
    chmod +x start.sh

# Use exec form for better signal handling
CMD ["./start.sh"]