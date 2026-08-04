import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import os from 'node:os';

/** IPs IPv4 da máquina (para imprimir URL do celular no terminal). */
function lanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const out: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

export default defineConfig({
  envDir: path.resolve(__dirname, '../../'),
  plugins: [
    react(),
    {
      name: 'concluiai-lan-hint',
      configureServer(server) {
        server.httpServer?.once('listening', () => {
          const ips = lanAddresses();
          if (!ips.length) return;
          console.log('\n  📱 Teste no celular (mesmo Wi‑Fi):');
          for (const ip of ips) {
            console.log(`     http://${ip}:5173`);
          }
          console.log(
            '  → Use essa URL no browser do celular (API via proxy, sem localhost).\n'
          );
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@concluiai/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    // Escuta em todas as interfaces — notebook + celular na LAN
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Proxy: celular → http://IP:5173/api/* → http://127.0.0.1:4000/api/*
    // Assim o mobile NÃO precisa alcançar a porta 4000 diretamente.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
      '/webhooks': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
});
