import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Auto-mount any gizmo pack that exports a default object with register(app).
 * Expected structure:
 *   api/gizmos/<slug>/server/index.js   (or server.js)
 */
export async function mountGizmoPacks(app) {
  const baseDir = path.resolve(process.cwd(), 'api', 'gizmos');

  if (!fs.existsSync(baseDir)) {
    console.log('[GIZMOS] No gizmos directory:', baseDir);
    return;
  }

  const gizmoDirs = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  console.log('[GIZMOS] Found packs:', gizmoDirs);

  for (const slug of gizmoDirs) {
    const candidates = [
      path.join(baseDir, slug, 'server', 'index.js'),
      path.join(baseDir, slug, 'server.js'),
    ];

    const entry = candidates.find((p) => fs.existsSync(p));
    if (!entry) {
      console.log(`[GIZMOS] ${slug}: no server entry (skipping)`);
      continue;
    }

    try {
      const mod = await import(pathToFileURL(entry).href);
      const pack = mod?.default;

      if (pack && typeof pack.register === 'function') {
        pack.register(app);
        console.log(`[GIZMOS] Mounted: ${slug}`);
      } else {
        console.log(`[GIZMOS] ${slug}: missing default export register(app) (skipping)`);
      }
    } catch (e) {
      console.error(`[GIZMOS] Failed to mount ${slug}:`, e?.message || e);
    }
  }
}
