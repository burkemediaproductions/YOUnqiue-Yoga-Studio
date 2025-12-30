// api/gizmos-loader.js
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * Auto-mount any gizmo pack that exports a default object with register(app).
 *
 * Supported structures:
 *   (when cwd is repo root)
 *     api/src/gizmos/<slug>/server/index.js
 *     api/src/gizmos/<slug>/server.js
 *     api/gizmos/<slug>/server/index.js
 *     api/gizmos/<slug>/server.js
 *
 *   (when cwd is api/ on Render)
 *     src/gizmos/<slug>/server/index.js
 *     src/gizmos/<slug>/server.js
 *     gizmos/<slug>/server/index.js
 *     gizmos/<slug>/server.js
 */
export async function mountGizmoPacks(app) {
  const cwd = process.cwd();

  const baseDirs = [
    // ✅ Render root-dir = api
    path.resolve(cwd, "src", "gizmos"),
    path.resolve(cwd, "gizmos"),

    // ✅ Repo root (legacy / local)
    path.resolve(cwd, "api", "src", "gizmos"),
    path.resolve(cwd, "api", "gizmos"),
  ];

  console.log("[GIZMOS] mountGizmoPacks() cwd =", cwd);
  console.log("[GIZMOS] baseDirs =", baseDirs);

  const mounted = new Set();
  let sawAnyBaseDir = false;

  for (const baseDir of baseDirs) {
    if (!fs.existsSync(baseDir)) {
      console.log("[GIZMOS] No gizmos directory:", baseDir);
      continue;
    }

    sawAnyBaseDir = true;

    const gizmoDirs = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    console.log("[GIZMOS] Found packs in", baseDir, ":", gizmoDirs);

    for (const slug of gizmoDirs) {
      if (mounted.has(slug)) continue; // prefer first match in baseDirs order

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

  if (!sawAnyBaseDir) {
    console.log("[GIZMOS] No base gizmos folders exist at any expected path.");
  }

  if (!mounted.size) {
    console.log("[GIZMOS] No packs mounted.");
  } else {
    console.log("[GIZMOS] Mounted packs:", Array.from(mounted));
  }
}
