// scripts/build-instructors.mjs
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

/**
 * Publishing controls:
 * - INSTRUCTORS_HIDE_IDENTITY_IDS="1807950,1520302"
 * - INSTRUCTORS_HIDE_USERNAMES="StephanieMac,SomeUser"
 * - INSTRUCTORS_HIDE_NAMES="Stephanie Norwood,First Last"
 *
 * (Names are compared lowercased/trimmed; IDs/usernames exact match after trimming)
 */
const HIDE_IDENTITY_IDS = new Set(
  (process.env.INSTRUCTORS_HIDE_IDENTITY_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const HIDE_USERNAMES = new Set(
  (process.env.INSTRUCTORS_HIDE_USERNAMES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const HIDE_NAMES = new Set(
  (process.env.INSTRUCTORS_HIDE_NAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

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

  const withWidth = sources.filter((s) => Number.isFinite(Number(s.width)));
  if (withWidth.length) {
    withWidth.sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640));
    return withWidth[0].url || null;
  }
  return sources[0].url || null;
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

function shouldHideInstructor({ item, identity, fullName }) {
  const identityId = String(identity?.id || "").trim();
  const username = String(identity?.username || item?.username || "").trim();
  const nameKey = String(fullName || "").trim().toLowerCase();

  if (identityId && HIDE_IDENTITY_IDS.has(identityId)) return true;
  if (username && HIDE_USERNAMES.has(username)) return true;
  if (nameKey && HIDE_NAMES.has(nameKey)) return true;

  return false;
}

async function main() {
  console.log("[BUILD] Instructors generator starting…");
  console.log("[BUILD] API_URL:", API_URL);
  console.log("[BUILD] PUBLISH_DIR:", PUBLISH_DIR);
  console.log("[BUILD] GENERATE_DETAIL:", GENERATE_DETAIL);

  if (HIDE_IDENTITY_IDS.size || HIDE_USERNAMES.size || HIDE_NAMES.size) {
    console.log("[BUILD] Hide lists enabled:", {
      ids: [...HIDE_IDENTITY_IDS],
      usernames: [...HIDE_USERNAMES],
      names: [...HIDE_NAMES],
    });
  }

  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`[BUILD] Fetch failed: ${res.status} ${res.statusText}`);

  const json = await res.json();
  if (!json?.ok) throw new Error(`[BUILD] API returned ok=false: ${json?.error || "Unknown error"}`);

  // Your API response shape: { ok:true, data:{ response:{ data:{ cache, items }}}}
  const payload = json.data?.response?.data;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const cacheIdentities = Array.isArray(payload?.cache?.identities) ? payload.cache.identities : [];
  const cacheImages = Array.isArray(payload?.cache?.images) ? payload.cache.images : [];

  const identityById = new Map(cacheIdentities.map((i) => [String(i.id), i]));
  const imageById = new Map(cacheImages.map((img) => [String(img.id), img]));

  // ✅ Visible filters: hide list + must have photo + must have non-placeholder bio
  const visibleItems = items.filter((item) => {
    const identity = identityById.get(String(item.identity_id)) || null;

    const fullName = `${identity?.first_name || item.first_name || ""} ${
      identity?.last_name || item.last_name || ""
    }`.trim();

    // 1) Publishing control hide list
    if (shouldHideInstructor({ item, identity, fullName })) return false;

    // 2) must have photo
    const imageId = String(item.profile_picture_image_id || identity?.profile_picture_id || "").trim();
    if (!imageId) return false;

    // 3) must have bio (non-placeholder)
    const about = (identity?.about_me || item.about_me || "").trim().toLowerCase();
    if (!about) return false;
    if (about.includes("bio coming soon") || about.includes("coming soon")) return false;

    return true;
  });

  const cards = [];
  const detailOutputs = [];

  for (const item of visibleItems) {
    const identity = identityById.get(String(item.identity_id)) || null;

    const fullName = `${identity?.first_name || item.first_name || ""} ${
      identity?.last_name || item.last_name || ""
    }`.trim();

    const about = (identity?.about_me || item.about_me || "").trim();
    const imageId = String(item.profile_picture_image_id || identity?.profile_picture_id || "").trim();
    const imageObj = imageId ? imageById.get(imageId) : null;
    const imageUrl = pickImageUrl(imageObj);

    const slug = slugify(fullName) || slugify(identity?.username || item.username) || String(item.id);
    const detailHref = GENERATE_DETAIL ? `/instructors/${slug}/` : null;

    cards.push(buildInstructorCard({ item, identity, imageUrl, detailHref }));

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

  const instructorsPath = path.join(PUBLISH_DIR, "instructors.html");
  const instructorsHtml = await fs.readFile(instructorsPath, "utf8");

  if (!instructorsHtml.includes(PLACEHOLDER)) {
    throw new Error(
      `[BUILD] Placeholder not found in instructors.html. Add this token where you want the grid:\n${PLACEHOLDER}`
    );
  }

  await fs.writeFile(instructorsPath, instructorsHtml.replace(PLACEHOLDER, gridHtml), "utf8");

  console.log(
    `[BUILD] Updated ${instructorsPath} with ${visibleItems.length} instructors (filtered from ${items.length}).`
  );

  if (GENERATE_DETAIL) {
    for (const d of detailOutputs) {
      await fs.mkdir(d.outDir, { recursive: true });
      await fs.writeFile(d.outPath, d.html, "utf8");
    }
    console.log(`[BUILD] Wrote ${detailOutputs.length} instructor detail pages.`);
  }

  console.log("[BUILD] Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
