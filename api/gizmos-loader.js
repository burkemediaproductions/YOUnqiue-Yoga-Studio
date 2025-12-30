import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Auto-mount any gizmo pack.
 *
 * Supports default exports:
 *  A) { register(app) }         ✅ preferred
 *  B) express.Router()          ✅ fallback (mounted at /api/gizmos/<slug>)
 *
 * Supported structures:
 *   api/src/gizmos/<slug>/server/index.js   ✅
 *   api/src/gizmos/<slug>/server.js
 *   api/gizmos/<slug>/server/index.js      (legacy)
 *   api/gizmos/<slug>/server.js
 */
export async function mountGizmoPacks(app) {
  const baseDirs = [
    path.resolve(process.cwd(), 'api', 'src', 'gizmos'),
    path.resolve(process.cwd(), 'api', 'gizmos'),
  ];

  const mounted = new Set();

  for (const baseDir of baseDirs) {
    if (!fs.existsSync(baseDir)) {
      console.log('[GIZMOS] No gizmos directory:', baseDir);
      continue;
    }

    const gizmoDirs = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    console.log('[GIZMOS] Scanning', baseDir, '->', gizmoDirs.length, 'folders');

    for (const slug of gizmoDirs) {
      if (mounted.has(slug)) continue; // prefer api/src/gizmos over api/gizmos

      const candidates = [
        path.join(baseDir, slug, 'server', 'index.js'),
        path.join(baseDir, slug, 'server.js'),
      ];

      const entry = candidates.find((p) => fs.existsSync(p));
      if (!entry) {
        console.log(`[GIZMOS] ${slug}: no server entry (skipping)`);
        continue;
      }

      console.log(`[GIZMOS] ${slug}: found entry -> ${entry}`);

      try {
        const mod = await import(pathToFileURL(entry).href);
        const pack = mod?.default;

        // A) Preferred: pack object with register(app)
        if (pack && typeof pack.register === 'function') {
          pack.register(app);
          mounted.add(slug);
          console.log(`[GIZMOS] Mounted pack: ${slug}`);
          continue;
        }

        // B) Fallback: default export is an express.Router()
        // Heuristic: Router has .use/.get/.post and 'handle' function internally
        const looksLikeRouter =
          pack &&
          typeof pack === 'function' && // router is a function(req,res,next)
          typeof pack.use === 'function' &&
          typeof pack.get === 'function';

        if (looksLikeRouter) {
          app.use(`/api/gizmos/${slug}`, pack);
          mounted.add(slug);
          console.log(`[GIZMOS] Mounted router pack: ${slug} at /api/gizmos/${slug}`);
          continue;
        }

        console.log(
          `[GIZMOS] ${slug}: default export not recognized (needs {register(app)} or express.Router())`
        );
      } catch (e) {
        console.error(`[GIZMOS] Failed to mount ${slug}:`, e?.message || e);
      }
    }
  }

  if (!mounted.size) {
    console.log('[GIZMOS] No packs mounted.');
  } else {
    console.log('[GIZMOS] Mounted packs:', Array.from(mounted));
  }
}
