import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

/**
 * Auto-mount any gizmo pack that exports a default object with register(app).
 *
 * Supported structures:
 *   api/src/gizmos/<slug>/server/index.js   ✅ (your current)
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

    if (gizmoDirs.length) {
      console.log('[GIZMOS] Found packs in', baseDir, ':', gizmoDirs);
    }

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

      try {
        const mod = await import(pathToFileURL(entry).href);
        const pack = mod?.default;

        if (pack && typeof pack.register === 'function') {
          pack.register(app);
          mounted.add(slug);
          console.log(`[GIZMOS] Mounted: ${slug} (${entry})`);
        } else {
          console.log(
            `[GIZMOS] ${slug}: missing default export register(app) (skipping)`
          );
        }
      } catch (e) {
        console.error(`[GIZMOS] Failed to mount ${slug}:`, e?.message || e);
      }
    }
  }

  if (!mounted.size) {
    console.log('[GIZMOS] No packs mounted.');
  }
}
