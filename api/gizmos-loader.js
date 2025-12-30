import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * Auto-mount any gizmo pack that exports a default object with register(app).
 *
 * Supported structures:
 *   api/src/gizmos/<slug>/server/index.js   ✅
 *   api/src/gizmos/<slug>/server.js
 *   api/gizmos/<slug>/server/index.js      (legacy)
 *   api/gizmos/<slug>/server.js
 */
export async function mountGizmoPacks(app) {
  const cwd = process.cwd();

  const baseDirs = [
    path.resolve(cwd, "api", "src", "gizmos"),
    path.resolve(cwd, "api", "gizmos"),
    path.resolve(cwd, "src", "gizmos"),
    path.resolve(cwd, "gizmos"),
  ];

  console.log("[GIZMOS] mountGizmoPacks() cwd =", cwd);
  console.log("[GIZMOS] baseDirs =", baseDirs);

  const mounted = new Set();

  for (const baseDir of baseDirs) {
    if (!fs.existsSync(baseDir)) {
      console.log("[GIZMOS] No gizmos directory:", baseDir);
      continue;
    }

    const gizmoDirs = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    if (gizmoDirs.length) {
      console.log("[GIZMOS] Found packs in", baseDir, ":", gizmoDirs);
    }

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

      console.log(`[GIZMOS] ${slug}: importing -> ${entry}`);

      try {
        const mod = await import(pathToFileURL(entry).href);
        const pack = mod?.default;

        if (pack && typeof pack.register === "function") {
          pack.register(app);
          mounted.add(slug);
          console.log(`[GIZMOS] Mounted: ${slug}`);
        } else {
          console.log(
            `[GIZMOS] ${slug}: missing default export register(app) (skipping)`
          );
        }
      } catch (e) {
        // ✅ This is the money: we need file/line
        console.error(`[GIZMOS] Failed to mount ${slug}.`);
        console.error("[GIZMOS] Entry:", entry);
        console.error("[GIZMOS] Error name:", e?.name);
        console.error("[GIZMOS] Error message:", e?.message);
        console.error("[GIZMOS] Stack:\n", e?.stack || e);
      }
    }
  }

  if (!mounted.size) {
    console.log("[GIZMOS] No packs mounted.");
  } else {
    console.log("[GIZMOS] Mounted packs:", Array.from(mounted));
  }
}
