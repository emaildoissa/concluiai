import { Router } from 'express';
import { config, hasSupabaseConfig } from '../config.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'concluiai-api',
    env: process.env.NODE_ENV ?? 'development',
    supabaseConfigured: hasSupabaseConfig(),
    aiProvider: 'gemini',
    whatsappProvider: config.whatsapp.provider,
    timestamp: new Date().toISOString(),
  });
});
