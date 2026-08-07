import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { evidenceRouter } from './routes/evidence.js';
import { healthRouter } from './routes/health.js';
import { evidencesRouter } from './routes/evidences.js';
import { scoreRouter } from './routes/score.js';
import { tasksRouter } from './routes/tasks.js';
import { whatsappWebhookRouter } from './routes/whatsapp-webhook.js';
import { dashboardRouter } from './routes/dashboard.js';
import { settingsRouter } from './routes/settings.js';
import { checklistsRouter } from './routes/checklists.js';
import { unitsRouter } from './routes/units.js';
import { operatorsRouter } from './routes/operators.js';
import { trainingRouter } from './routes/training.js';
import { checkCriticalOverdueTasks } from './jobs/alerts.js';
import { recalculateDailyScores } from './services/score.js';
import { generateTasksForDate } from './services/tasks.js';
import { purgeOldEvidences } from './services/evidences.js';
import cron from 'node-cron';

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.use('/health', healthRouter);
app.use('/api/evidence', evidenceRouter);
app.use('/api/evidences', evidencesRouter);
app.use('/api/score', scoreRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/checklists', checklistsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/operators', operatorsRouter);
app.use('/api/training', trainingRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/settings', settingsRouter);
app.use('/webhooks/whatsapp', whatsappWebhookRouter);

app.get('/', (_req, res) => {
  res.json({
    name: 'ConcluíAI API',
    version: '0.1.0',
    docs: 'Veja .env.example para configurar Supabase, IA e WhatsApp',
  });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: err.message ?? 'Erro interno do servidor.' });
});

function startJobs() {
  setInterval(async () => {
    try {
      const r = await checkCriticalOverdueTasks();
      if (r.alerted > 0) console.log(`[jobs] alertas enviados: ${r.alerted}`);
    } catch (e) {
      console.error('[jobs] alerts', e);
    }
  }, config.jobs.alertCheckIntervalMs);

  setInterval(async () => {
    try {
      const r = await recalculateDailyScores();
      console.log(`[jobs] scores recalculados: ${r.unitsProcessed} unidades`);
    } catch (e) {
      console.error('[jobs] score', e);
    }
  }, config.jobs.scoreRecalcIntervalMs);

  if (config.jobs.dailyGenerateEnabled) {
    cron.schedule(
      config.jobs.dailyGenerateCron,
      async () => {
        try {
          const r = await generateTasksForDate({});
          console.log(`[jobs] tarefas geradas: ${r.created}`);
        } catch (e) {
          console.error('[jobs] daily-generate', e);
        }
      },
      { timezone: config.jobs.dailyGenerateTz }
    );
  }

  if (config.jobs.evidenceCleanupEnabled) {
    cron.schedule(
      config.jobs.evidenceCleanupCron,
      async () => {
        try {
          const r = await purgeOldEvidences({ olderThanDays: config.jobs.evidenceRetentionDays });
          if (r.oldRows > 0) {
            console.log(`[jobs] evidências antigas removidas: ${r.oldRows} (${r.storageFiles} fotos)`);
          }
        } catch (e) {
          console.error('[jobs] evidence-cleanup', e);
        }
      },
      { timezone: config.jobs.evidenceCleanupTz }
    );
  }

  console.log(
    `[jobs] alertas a cada ${config.jobs.alertCheckIntervalMs}ms | score a cada ${config.jobs.scoreRecalcIntervalMs}ms`
  );
  if (config.jobs.dailyGenerateEnabled) {
    console.log(
      `[jobs] geração diária de tarefas: ${config.jobs.dailyGenerateCron} (${config.jobs.dailyGenerateTz})`
    );
  } else {
    console.log('[jobs] geração diária de tarefas: desligada (CRON_DAILY_GENERATE=0)');
  }
  if (config.jobs.evidenceCleanupEnabled) {
    console.log(
      `[jobs] limpeza de evidências: ${config.jobs.evidenceCleanupCron} (> ${config.jobs.evidenceRetentionDays} dias, ${config.jobs.evidenceCleanupTz})`
    );
  } else {
    console.log('[jobs] limpeza de evidências: desligada (CRON_EVIDENCE_CLEANUP=0)');
  }
}

// 0.0.0.0: aceita conexões da LAN (celular), não só localhost
app.listen(config.port, '0.0.0.0', () => {
  console.log(`\n🚀 ConcluíAI API em http://localhost:${config.port} (0.0.0.0)`);
  console.log(`   WhatsApp: ${config.whatsapp.provider} | Gemini: ${config.geminiModel}`);
  console.log(`   Mobile: abra o app em http://<IP-do-PC>:4000 — a API expõe /api/* e /health`);
  console.log(`   Web: o dashboard usa o proxy do Vite (apps/web) apontando para esta API\n`);
  startJobs();
});
