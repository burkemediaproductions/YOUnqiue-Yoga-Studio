// scripts/build-instructors.mjs
// Build-time generator for instructors page (and optional detail pages)
//
// Defaults:
// - Reads/writes instructors.html in the publish directory
// - Injects HTML at <!-- INSTRUCTORS_STATIC -->
//
// Env vars you can set in Netlify:
// - INSTRUCTORS_API_URL (default: your Render endpoint)
// - PUBLISH_DIR (default: "."; set to "dist" if your build outputs there)
// - GENERATE_INSTRUCTOR_DETAIL_PAGES ("true" to enable)
// - SITE_ORIGIN (optional, for canonical URLs, e.g. https://youniqueyoga.netlify.app)

import fs from "node:fs/promises";
import path from "node:path";

const API_URL =
  process.env.INSTRUCTORS_API_URL?.trim() ||
  "https://younqiue-yoga.onrender.com/api/gizmos/fitdegree/public/instructors";

const PUBLISH_DIR = process.env.PUBLISH_DIR?.trim() || ".";
const GENERATE_DETAIL =
  (process.env.GENERATE_INSTRUCTOR_DETAIL_PAGES || "").toLowerCase() === "true";

const SITE_ORIGIN = (process.env.SITE_ORIGIN || "").replace(/\/+$/, ""); // optional

const PLACEHOLDER = "<!-- INSTRUCTORS_STATIC -->";

function slugify(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Pick a reasonable image (prefer ~640 if present, else largest, else first)
function pickImageUrl(imageObj) {
  if (!imageObj?.sources?.length) return null;
  const sources = [...imageObj.sources];

  // If widths exist, try closest to 640
  const withWidth = sources.filter((s) => Number.isFinite(Number(s.width)));
  if (withWidth.length) {
    withWidth.sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640));
    return withWidth[0].url || null;
  }

  return sources[0].url || null;
}

/**
 * Determine whether an instructor should be visible publicly.
 * We check BOTH the instructor record (`item`) and the person/identity record (`identity`)
 * because providers sometimes store "inactive/deactivated" flags on either one.
 *
 * Rule: If we can clearly tell they're inactive/deactivated/deleted -> hide.
 * If there are NO signals -> treat as active (don't hide accidentally).
 */
function isActiveInstructor(record) {
  if (!record || typeof record !== "object") return true;

  // hard deletes / soft deletes
  if (record?.is_deleted === true) return false;
  if (record?.deleted === true) return false;
  if (record?.archived === true) return false;

  // common active/enable flags
  if (record?.active === false) return false;
  if (record?.is_active === false) return false;
  if (record?.isActive === false) return false;
  if (record?.enabled === false) return false;
  if (record?.is_enabled === false) return false;

  // deactivation patterns
  if (record?.deactivated === true) return false;
  if (record?.deactivated_at) return false;

  // status strings
  const status = String(record?.status || record?.state || "").toLowerCase().trim();
  if (status) {
    // treat anything not "active" as inactive
    if (status !== "active") return false;
  }

  return true;
}

function isPublicInstructor(item, identity) {
  // If either side says inactive -> hide
  if (!isActiveInstructor(item)) return false;
  if (!isActiveInstructor(identity)) return false;

  return true;
}

function buildInstructorCard({ item, identity, imageUrl, detailHref }) {
  const fullName = `${identity?.first_name || item.first_name || ""} ${
    identity?.last_name || item.last_name || ""
  }`.trim();

  const about = (identity?.about_me || item.about_me || "").trim();

  const title = escapeHtml(fullName || "Instructor");
  const bio = escapeHtml(about);

  const img = imageUrl
    ? `<img class="avatar" src="${escapeHtml(imageUrl)}" alt="${title}" loading="lazy" decoding="async" />`
    : `<div class="avatar avatar-fallback" aria-hidden="true"></div>`;

  const nameBlock = detailHref
    ? `<h3><a href="${escapeHtml(detailHref)}">${title}</a></h3>`
    : `<h3>${title}</h3>`;

  const shortBio = bio
    ? `<p class="bio">${bio}</p>`
    : `<p class="bio" style="opacity:.75;">Bio coming soon.</p>`;

  return `
    <article class="card instructor-card">
      ${img}
      ${nameBlock}
      ${shortBio}
    </article> 
  `.trim();
}

function buildGridHtml(cardsHtml) {
  return `
    <div class="grid cols-3 instructor-grid" style="margin-top:18px;">
      ${cardsHtml.join("\n")}
    </div>
  `.trim();
}

function buildDetailPageHtml({ fullName, about, imageUrl, backHref, canonical }) {
  const title = escapeHtml(fullName || "Instructor");
  const bio = escapeHtml(about || "");

  const canonicalTag = canonical
    ? `<link rel="canonical" href="${escapeHtml(canonical)}"/>`
    : "";

  const img = imageUrl
    ? `<img class="avatar avatar-lg" src="${escapeHtml(imageUrl)}" alt="${title}" loading="lazy" decoding="async" />`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title} | YOUnique Yoga Studio</title>
  ${canonicalTag}
  <link rel="stylesheet" href="/assets/styles.css"/>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="/">
        <img src="/assets/logo.png" alt="YOUnique Yoga logo"/>
        <span>YOUnique Yoga</span>
      </a>

      <nav class="nav" aria-label="Primary">
        <a href="/">Home</a>
        <a href="/book.html">Book</a>
        <a href="/classes-services.html">Classes &amp; Services</a>
        <a href="/instructors.html">Instructor Team</a>
        <a href="/teacher-training.html">Teacher Training</a>
        <a href="/contact.html">Contact</a>
      </nav>

      <div class="header-actions">
        <a class="btn btn-primary" href="/book.html#book">Book a Class</a>
      </div>
    </div>
  </header>

  <main id="main">
    <section class="page-hero">
      <div class="container">
        <div class="breadcrumb"><a href="/">Home</a> / <a href="${escapeHtml(
          backHref
        )}">Instructor Team</a> / ${title}</div>
        <h1>${title}</h1>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="card instructor-detail">
          ${img}
          <div>
            <h2 style="margin-top:0;">About ${title}</h2>
            <p style="white-space:pre-wrap;">${bio || "Bio coming soon."}</p>
            <p style="margin-top:14px;">
              <a class="btn" href="${escapeHtml(backHref)}">← Back to Instructor Team</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-bottom">
      <div>© <span id="year"></span> YOUnique Yoga Studio</div>
      <div><a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></div>
    </div>
  </footer>

  <script>document.getElementById("year").textContent = new Date().getFullYear();</script>
</body>
</html>`;
}

async function main() {
  console.log("[BUILD] Instructors generator starting…");
  console.log("[BUILD] API_URL:", API_URL);
  console.log("[BUILD] PUBLISH_DIR:", PUBLISH_DIR);
  console.log("[BUILD] GENERATE_DETAIL:", GENERATE_DETAIL);

  const res = await fetch(API_URL);
  if (!res.ok) {
    throw new Error(`[BUILD] Fetch failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!json?.ok) {
    throw new Error(`[BUILD] API returned ok=false: ${json?.error || "Unknown error"}`);
  }

  // Your API response shape: { ok:true, data:{ auth_status, response:{ data:{ cache, items }}}}
  const payload = json.data?.response?.data;
  const items = payload?.items || [];
  const cacheIdentities = payload?.cache?.identities || [];
  const cacheImages = payload?.cache?.images || [];

  // ✅ build lookup maps FIRST (so we can reference them in filters/loops)
  const identityById = new Map(cacheIdentities.map((i) => [String(i.id), i]));
  const imageById = new Map(cacheImages.map((img) => [String(img.id), img]));

  // ✅ Filter out instructors that shouldn't be public (inactive/deactivated/etc)
  // ✅ PLUS your existing "must have photo + must have real bio" rule
  const visibleItems = items.filter((item) => {
    const identity = identityById.get(String(item.identity_id)) || null;

    // 1) Hide inactive/deactivated
    if (!isPublicInstructor(item, identity)) return false;

    // 2) Require photo
    const imageId = String(
      item.profile_picture_image_id || identity?.profile_picture_id || ""
    ).trim();
    if (!imageId) return false;

    // 3) Require bio (and not placeholder)
    const about = (identity?.about_me || item.about_me || "").trim().toLowerCase();
    if (!about) return false;

    if (about.includes("bio coming soon") || about.includes("coming soon")) {
      return false;
    }

    return true;
  });

  // Build cards and optionally detail pages
  const cards = [];
  const detailOutputs = []; // { outPath, html }

  for (const item of visibleItems) {
    const identity = identityById.get(String(item.identity_id)) || null;

    const fullName = `${identity?.first_name || item.first_name || ""} ${
      identity?.last_name || item.last_name || ""
    }`.trim();

    const about = (identity?.about_me || item.about_me || "").trim();
    const imageId = String(item.profile_picture_image_id || identity?.profile_picture_id || "");
    const imageObj = imageId ? imageById.get(imageId) : null;
    const imageUrl = pickImageUrl(imageObj);

    const slug = slugify(fullName) || slugify(item.username) || String(item.id);
    const detailHref = GENERATE_DETAIL ? `/instructors/${slug}/` : null;

    cards.push(
      buildInstructorCard({
        item,
        identity,
        imageUrl,
        detailHref,
      })
    );

    if (GENERATE_DETAIL) {
      const outDir = path.join(PUBLISH_DIR, "instructors", slug);
      const outPath = path.join(outDir, "index.html");

      const canonical = SITE_ORIGIN ? `${SITE_ORIGIN}/instructors/${slug}/` : "";
      const html = buildDetailPageHtml({
        fullName,
        about,
        imageUrl,
        backHref: "/instructors.html",
        canonical,
      });

      detailOutputs.push({ outDir, outPath, html });
    }
  }

  const gridHtml = buildGridHtml(cards);

  // Read instructors.html
  const instructorsPath = path.join(PUBLISH_DIR, "instructors.html");
  let instructorsHtml;
  try {
    instructorsHtml = await fs.readFile(instructorsPath, "utf8");
  } catch {
    throw new Error(
      `[BUILD] Could not read ${instructorsPath}. Make sure instructors.html exists in your publish directory.`
    );
  }

  if (!instructorsHtml.includes(PLACEHOLDER)) {
    throw new Error(
      `[BUILD] Placeholder not found in instructors.html. Add this token where you want the grid:\n${PLACEHOLDER}`
    );
  }

  const updated = instructorsHtml.replace(PLACEHOLDER, gridHtml);
  await fs.writeFile(instructorsPath, updated, "utf8");

  console.log(
    `[BUILD] Updated ${instructorsPath} with ${visibleItems.length} instructors (filtered from ${items.length}).`
  );

  // Write detail pages
  if (GENERATE_DETAIL) {
    for (const d of detailOutputs) {
      await fs.mkdir(d.outDir, { recursive: true });
      await fs.writeFile(d.outPath, d.html, "utf8");
    }
    console.log(`[BUILD] Wrote ${detailOutputs.length} instructor detail pages to /instructors/<slug>/`);
  }

  console.log("[BUILD] Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
