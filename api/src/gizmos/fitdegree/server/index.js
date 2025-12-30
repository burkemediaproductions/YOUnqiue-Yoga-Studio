import router from './router.js';

/**
 * FitDegree Gizmo Pack
 *
 * Mounts routes under:
 *   /api/gizmos/fitdegree/*
 *
 * Public routes should live under:
 *   /api/gizmos/fitdegree/public/*
 */
export default {
  register(app) {
    // Small public ping to verify the pack is mounted without auth
    router.get('/public/__ping', (_req, res) => {
      res.json({ ok: true, pack: 'fitdegree', ts: Date.now() });
    });

    app.use('/api/gizmos/fitdegree', router);
    console.log('[GIZMOS] FitDegree mounted at /api/gizmos/fitdegree');
  },
};
