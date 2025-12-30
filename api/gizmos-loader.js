import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

/**
 * Auto-mount any gizmo pack that exports a default object with register(app).
 *
 * Supported structures:
 *   api/src/gizmos/<slug>/server/index.js
 *   api/src/gizmos/<slug>/server.js
 *   api/gizmos/<slug>/server/index.js
 *   api/gizmos/<slug>/server.js
 */
export async function mountGizmoPacks(app) {
  const cwd = process.cwd();

  const baseDirs = [
    path.resolve(cwd, 'api', 'src', 'gizmos'),
    path.resolve(cwd, 'api', 'gizmos'),
    path.resolve(cwd, 'src', 'gizmos'),
    path.resolve(cwd, 'gizmos'),
  ];

  console.log('[GIZMOS] mountGizmoPacks() cwd =', cwd);
  console.log('[GIZMOS] baseDirs =', baseDirs);

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

      console.log(`[GIZMOS] ${slug}: importing ->`, entry);

      // ✅ 1) Pre-check syntax to get exact line/col in logs
      try {
        const check = spawnSync(process.execPath, ['--check', entry], {
          encoding: 'utf8',
        });

        if (check.status !== 0) {
          console.error(`[GIZMOS] ${slug}: node --check FAILED`);
          if (check.stdout) console.error('[GIZMOS] check stdout:\n' + check.stdout);
          if (check.stderr) console.error('[GIZMOS] check stderr:\n' + check.stderr);

          // Also scan for common merge-conflict markers
          try {
            const src = fs.readFileSync(entry, 'utf8');
            const markers = ['<<<<<<<', '>>>>>>>', '=======', '|||||||'];
            for (const m of markers) {
              const idx = src.indexOf(m);
              if (idx !== -1) {
                const before = src.slice(0, idx).split('\n').length;
                console.error(`[GIZMOS] ${slug}: found merge marker "${m}" near line ${before}`);
              }
            }
          } catch {}

          // Skip mounting this pack
          continue;
        }
      } catch (e) {
        console.error(`[GIZMOS] ${slug}: node --check threw`, e?.message || e);
        continue;
      }

      // ✅ 2) Import + register
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
        console.error(`[GIZMOS] Failed to mount ${slug}.`);
        console.error('[GIZMOS] Entry:', entry);
        console.error('[GIZMOS] Error name:', e?.name);
        console.error('[GIZMOS] Error message:', e?.message || e);
        console.error('[GIZMOS] Stack:\n', e?.stack || '(no stack)');
      }
    }
  }

  if (!mounted.size) {
    console.log('[GIZMOS] No packs mounted.');
  } else {
    console.log('[GIZMOS] Mounted packs:', Array.from(mounted));
  }
}
