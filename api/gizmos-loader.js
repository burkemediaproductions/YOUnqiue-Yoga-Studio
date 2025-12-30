import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

function listSuspiciousLines(filePath) {
  try {
    const src = fs.readFileSync(filePath, "utf8");
    const lines = src.split(/\r?\n/);

    const suspicious = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Lines that START with || are the classic "Unexpected token '||'" cause.
      if (/^\s*\|\|/.test(line)) suspicious.push({ lineNo: i + 1, line });

      // Also flag common paste/merge artifacts
      if (line.includes("<<<<<<") || line.includes("======") || line.includes(">>>>>>")) {
        suspicious.push({ lineNo: i + 1, line });
      }

      // Rare: accidental double-pipe runs in weird contexts
      if (line.includes("||||")) suspicious.push({ lineNo: i + 1, line });
    }

    // Return first ~25 suspicious lines so logs don't explode
    return suspicious.slice(0, 25);
  } catch {
    return [];
  }
}

function walkJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;

  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const items = fs.readdirSync(cur, { withFileTypes: true });
    for (const it of items) {
      const p = path.join(cur, it.name);
      if (it.isDirectory()) {
        if (it.name === "node_modules") continue;
        stack.push(p);
      } else if (it.isFile() && p.endsWith(".js")) {
        out.push(p);
      }
    }
  }
  return out;
}

/**
 * Auto-mount any gizmo pack that exports a default object with register(app).
 *
 * Supported:
 *   api/src/gizmos/<slug>/server/index.js
 *   api/src/gizmos/<slug>/server.js
 *   api/gizmos/<slug>/server/index.js
 *   api/gizmos/<slug>/server.js
 */
export async function mountGizmoPacks(app) {
  const cwd = process.cwd();

  const baseDirs = [
    path.resolve(cwd, "api", "src", "gizmos"),
    path.resolve(cwd, "api", "gizmos"),
    // If your Render "Root Directory" is already /api, these will be the real ones:
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

      try {
        console.log(`[GIZMOS] ${slug}: importing ->`, entry);

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
        console.error(`[GIZMOS] Failed to mount ${slug}.`);
        console.error("[GIZMOS] Entry:", entry);
        console.error("[GIZMOS] Error name:", e?.name);
        console.error("[GIZMOS] Error message:", e?.message);

        // If it's a syntax error, scan the pack's JS files for classic causes.
        if (e?.name === "SyntaxError") {
          const packDir = path.join(baseDir, slug);
          const files = walkJsFiles(packDir);

          console.error(`[GIZMOS] SyntaxError scan in ${packDir} (${files.length} js files):`);

          let printed = 0;
          for (const f of files) {
            const suspicious = listSuspiciousLines(f);
            if (suspicious.length) {
              printed++;
              console.error(`  [GIZMOS] Suspicious lines in: ${f}`);
              for (const s of suspicious) {
                console.error(`    L${s.lineNo}: ${s.line}`);
              }
              if (printed >= 10) break; // don't spam logs
            }
          }

          if (printed === 0) {
            console.error("[GIZMOS] No obvious '|| at line start' or merge markers found in pack JS files.");
            console.error("[GIZMOS] Next step: run node --check on each pack file locally to find the exact parser failure.");
          }
        }

        if (e?.stack) {
          console.error("[GIZMOS] Stack:\n", e.stack);
        }
      }
    }
  }

  if (!mounted.size) {
    console.log("[GIZMOS] No packs mounted.");
  } else {
    console.log("[GIZMOS] Mounted packs:", Array.from(mounted));
  }
}
