import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

function existingDir(...parts) {
  const p = path.resolve(...parts);
  return fs.existsSync(p) ? p : null;
}

/**
 * Auto-mount gizmo packs from multiple possible base roots.
 *
 * Works whether Render runs:
 *  - from repo root        (cwd = /opt/render/project/src)
 *  - from api/ directory   (cwd = /opt/render/project/src/api)
 */
export async function mountGizmoPacks(app) {
  const cwd = process.cwd();

  // Candidate roots that might contain src/gizmos or gizmos
  const roots = [
    cwd,               // if cwd == repo root OR cwd == api
    path.resolve(cwd, '..'), // if cwd == api, this is repo root
  ];

  // Candidate baseDirs inside each root
  const baseDirs = [];
  for (const r of roots) {
    // New structure
    baseDirs.push(existingDir(r, 'src', 'gizmos'));
    // If running from repo root, this is the common path
    baseDirs.push(existingDir(r, 'api', 'src', 'gizmos'));
    // Legacy structure
    baseDirs.push(existingDir(r, 'gizmos'));
    baseDirs.push(existingDir(r, 'api', 'gizmos'));
  }

  // Deduplicate + remove nulls
  const uniqueBaseDirs = Array.from(new Set(baseDirs.filter(Boolean)));

  console.log('[GIZMOS] cwd:', cwd);
  console.log('[GIZMOS] scanning baseDirs:', uniqueBaseDirs);

  const mounted = new Set();

  for (const baseDir of uniqueBaseDirs) {
    let gizmoDirs = [];
    try {
      gizmoDirs = fs
        .readdirSync(baseDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch (e) {
      console.log('[GIZMOS] cannot read dir:', baseDir, e?.message || e);
      continue;
    }

    console.log('[GIZMOS] Found packs in', baseDir, ':', gizmoDirs);

    for (const slug of gizmoDirs) {
      if (mounted.has(slug)) continue;

      const candidates = [
        path.join(baseDir, slug, 'server', 'index.js'),
        path.join(baseDir, slug, 'server.js'),
      ];

      const entry = candidates.find((p) => fs.existsSync(p));
      if (!entry) {
        console.log(`[GIZMOS] ${slug}: no server entry (skipping)`);
        continue;
      }

      console.log(`[GIZMOS] ${slug}: loading ${entry}`);

      try {
        const mod = await import(pathToFileURL(entry).href);
        const pack = mod?.default;

        // A) Preferred: { register(app) }
        if (pack && typeof pack.register === 'function') {
          pack.register(app);
          mounted.add(slug);
          console.log(`[GIZMOS] Mounted pack: ${slug}`);
          continue;
        }

        // B) Fallback: express.Router() default export
        const looksLikeRouter =
          pack &&
          typeof pack === 'function' &&
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
