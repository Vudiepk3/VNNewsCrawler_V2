import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type { ArticleSortOrder, CrawlConfig, LogLevel, NewsSourceId } from './src/shared/types.ts';
import { crawlOrchestrator } from './server/crawler/orchestrator.ts';
import {
  clearLogs,
  deleteArticlesByIds,
  getArticleById,
  getConfig,
  getLogs,
  getSessions,
  listResultFiles,
  queryArticles,
  resolveSafeResultPath,
  saveConfig,
} from './server/storage/resultManager.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // Config endpoints
  app.get('/api/config', (_req, res) => {
    res.json(getConfig());
  });

  app.put('/api/config', (req, res) => {
    const body = (req.body || {}) as Partial<CrawlConfig>;
    const updated = saveConfig(body);
    res.json(updated);
  });

  // Crawl control & live SSE stream
  app.get('/api/crawl/status', (_req, res) => {
    res.json(crawlOrchestrator.getState());
  });

  app.get('/api/crawl/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendState = (state: ReturnType<typeof crawlOrchestrator.getState>) => {
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    };

    sendState(crawlOrchestrator.getState());

    const onProgress = (state: ReturnType<typeof crawlOrchestrator.getState>) => {
      sendState(state);
    };
    crawlOrchestrator.on('progress', onProgress);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      crawlOrchestrator.off('progress', onProgress);
    });
  });

  app.post('/api/crawl/start', (req, res) => {
    try {
      const body = (req.body || {}) as Partial<CrawlConfig>;
      const config = saveConfig(body);
      void crawlOrchestrator.start(config).catch(() => {
        // Error captured in orchestrator state & logs
      });
      res.json({ started: true, config, state: crawlOrchestrator.getState() });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Không thể bắt đầu' });
    }
  });

  app.post('/api/crawl/stop', (_req, res) => {
    const stopped = crawlOrchestrator.stop();
    res.json({ stopped, state: crawlOrchestrator.getState() });
  });

  app.post('/api/crawl/retry', (req, res) => {
    try {
      const state = crawlOrchestrator.getState();
      const bodyItems = Array.isArray(req.body?.items) ? req.body.items : state.failedUrls;
      const workers = Number(req.body?.numWorkers) || getConfig().numWorkers;
      void crawlOrchestrator.retryFailed(bodyItems, workers).catch(() => {
        // Handled by orchestrator
      });
      res.json({ started: true, count: bodyItems.length });
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Không thể thử lại' });
    }
  });

  // Articles library endpoints
  app.get('/api/articles', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const source = (typeof req.query.source === 'string' ? req.query.source : 'all') as NewsSourceId | 'all';
    const sort = (typeof req.query.sort === 'string' ? req.query.sort : 'newest') as ArticleSortOrder;
    res.json(queryArticles({ search, source, sort }));
  });

  app.get('/api/articles/:id', (req, res) => {
    const article = getArticleById(req.params.id);
    if (!article) {
      res.status(404).json({ error: 'Không tìm thấy bài viết' });
      return;
    }
    res.json(article);
  });

  app.delete('/api/articles/:id', (req, res) => {
    const deleted = deleteArticlesByIds([req.params.id]);
    if (deleted === 0) {
      res.status(404).json({ error: 'Không tìm thấy bài viết' });
      return;
    }
    res.json({ deleted });
  });

  app.post('/api/articles/bulk-delete', (req, res) => {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const deleted = deleteArticlesByIds(ids);
    res.json({ deleted });
  });

  // Files endpoints (result/)
  app.get('/api/files', (_req, res) => {
    res.json(listResultFiles());
  });

  app.get('/api/files/content', (req, res) => {
    const relPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!relPath) {
      res.status(400).json({ error: 'Thiếu tham số đường dẫn' });
      return;
    }
    try {
      const absPath = resolveSafeResultPath(relPath);
      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
        res.status(404).json({ error: 'Không tìm thấy tệp' });
        return;
      }
      const content = fs.readFileSync(absPath, 'utf-8');
      res.json({ path: relPath, content });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Đường dẫn không hợp lệ' });
    }
  });

  app.get('/api/files/raw', (req, res) => {
    const relPath = typeof req.query.path === 'string' ? req.query.path : '';
    const download = req.query.download === '1';
    if (!relPath) {
      res.status(400).json({ error: 'Thiếu tham số đường dẫn' });
      return;
    }
    try {
      const absPath = resolveSafeResultPath(relPath);
      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
        res.status(404).json({ error: 'Không tìm thấy tệp' });
        return;
      }
      const ext = path.extname(absPath).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.txt': 'text/plain; charset=utf-8',
        '.log': 'text/plain; charset=utf-8',
        '.yml': 'text/yaml; charset=utf-8',
      };
      res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
      if (download) {
        const fileName = path.basename(absPath).replace(/["\r\n]/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      }
      fs.createReadStream(absPath).pipe(res);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Đường dẫn không hợp lệ' });
    }
  });

  // Logs & Sessions
  app.get('/api/logs', (req, res) => {
    const level = typeof req.query.level === 'string' ? (req.query.level as LogLevel) : undefined;
    res.json(getLogs(level));
  });

  app.delete('/api/logs', (_req, res) => {
    clearLogs();
    res.json({ cleared: true });
  });

  app.get('/api/sessions', (_req, res) => {
    res.json(getSessions());
  });

  // Mount Vite middlewares in dev, or serve static dist in production
  if (!IS_PROD) {
    const disableHmr = process.env.DISABLE_HMR === 'true' || Boolean(process.env.APP_URL);
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VNNewsCrawler server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
