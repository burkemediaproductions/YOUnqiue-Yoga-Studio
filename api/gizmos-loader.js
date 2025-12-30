import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

/**
 * Auto-mount any gizmo pack that exports a default object with register(app).
 *
 * Supports BOTH deployments:
 * 1) Render Root Directory = repo root
 *    cwd: /opt/render/project/src
 *    packs: /opt/render/project/src/api/src/gizmos/<slug>/server/index.js
 *
 * 2) Render Root Directory = api/
 *    cwd: /opt/render/project/src/api
 *    packs: /opt/render/project/src/api/src/gizmos/<slug>/server/index.js
 */
export async function mountGizmoPacks(app) {
  const cwd = process.cwd();

  const baseDirs = [
    // If service root is repo root:
    path.resolve(cwd, "api", "src", "gizmos"),
    path.resolve(cwd, "api", "gizmos"),

    // If service root is already /api:
    path.resolve(cwd, "src", "gizmos"),
    path.resolve(cwd, "gizmos"),
  ];

  console.log("[GIZMOS] cwd:", cwd);
  console.log("[GIZMOS] baseDirs to check:", baseDirs);

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

  if (!mounted.size) console.log("[GIZMOS] No packs mounted.");
  return Array.from(mounted);
}
