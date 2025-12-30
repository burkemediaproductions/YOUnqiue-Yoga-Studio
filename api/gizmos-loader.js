// api/gizmos-loader.js
import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

/**
 * Auto-mount any gizmo pack that exports a default object with register(app).
 *
 * Supported structures:
 *   api/src/gizmos/<slug>/server/index.js   ✅ (preferred)
 *   api/src/gizmos/<slug>/server.js
 *   api/gizmos/<slug>/server/index.js      (legacy)
 *   api/gizmos/<slug>/server.js
 */
export async function mountGizmoPacks(app) {
  const here = path.dirname(fileURLToPath(import.meta.url));

  // If Render Root Directory is set to "api", then:
  //   process.cwd() === /opt/render/project/src/api
  // If Root Directory is repo root, then:
  //   process.cwd() === /opt/render/project/src
  const cwd = process.cwd();

  const baseDirs = [
    // ✅ When running from repo root
    path.resolve(cwd, "api", "src", "gizmos"),
    path.resolve(cwd, "api", "gizmos"),

    // ✅ When running from inside /api (Render Root Directory = api)
    path.resolve(cwd, "src", "gizmos"),
    path.resolve(cwd, "gizmos"),

    // ✅ Also resolve relative to this file (extra safety)
    path.resolve(here, "src", "gizmos"),
    path.resolve(here, "gizmos"),
  ];

  // de-dupe
  const uniqueBaseDirs = Array.from(new Set(baseDirs));

  console.log("[GIZMOS] cwd:", cwd);
  console.log("[GIZMOS] scanning baseDirs:", uniqueBaseDirs);

  const mounted = new Set();

  for (const baseDir of uniqueBaseDirs) {
    if (!fs.existsSync(baseDir)) {
      console.log("[GIZMOS] No gizmos directory:", baseDir);
      continue;
    }

    const gizmoDirs = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    console.log("[GIZMOS] Found packs in", baseDir, ":", gizmoDirs);

    for (const slug of gizmoDirs) {
      if (mounted.has(slug)) continue;

      const candidates = [
        path.join(baseDir, slug, "server", "index.js"),
        path.join(baseDir, slug, "server.js"),
      ];

      const entry = candidates.find((p) => fs.existsSync(p));
      if (!entry) {
        console.log(`[GIZMOS] ${slug}: no server entry (skipping)`);
        continue;
      }

      try {
        const mod = await import(pathToFileURL(entry).href);
        const pack = mod?.default;

        if (pack && typeof pack.register === "function") {
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
    console.log("[GIZMOS] No packs mounted.");
  } else {
    console.log("[GIZMOS] Mounted packs:", Array.from(mounted));
  }

  // returning this helps debugging in index.js if you want it
  return Array.from(mounted);
}
