// scripts/build-teacher-training.mjs
import fs from "node:fs/promises";
import path from "node:path";

const FITSPOT_ID = process.env.FITSPOT_ID?.trim() || "782";
const COMPANY_ID = process.env.COMPANY_ID?.trim() || "726";

const API_BASE =
  process.env.FITDEGREE_API_BASE?.trim().replace(/\/+$/, "") ||
  "https://api.fitdegree.com";

const PUBLISH_DIR = process.env.PUBLISH_DIR?.trim() || ".";
const PLACEHOLDER = "<!-- TRAINING_STATIC -->";

// How many training items to show
const LIMIT = Number(process.env.TRAINING_LIMIT || 6);

// If you want to only show items that look like training, use a keyword match.
// Leave empty ("") to show anything returned (still limited + sorted by title).
const TRAINING_KEYWORD = (process.env.TRAINING_KEYWORD || "teacher training")
  .trim()
  .toLowerCase();

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCard(item) {
  const title = escapeHtml(item.title || "Training");
  const level = escapeHtml(item.difficulty_text || "");
  const groupName = escapeHtml(item.group_name || item.class_group?.name || "");
  const descRaw = (item.description || "").trim();
  const desc = escapeHtml(descRaw);

  // You can send them to booking (or a specific training CTA)
  const href = "/book.html#book";

  return `
    <article class="card">
      <h3>${title}</h3>
      <p class="muted" style="margin-top:6px;">
        ${groupName || "Teacher Training"}${level ? ` · ${level}` : ""}
      </p>
      ${desc ? `<p style="margin-top:10px;">${desc}</p>` : ""}
      <p style="margin-top:14px;">
        <a class="btn btn-primary" href="${escapeHtml(href)}">View Schedule / Book</a>
      </p>
    </article>
  `.trim();
}

/**
 * IMPORTANT:
 * teacher-training.html already contains:
 *   <div class="grid ..."> <!-- TRAINING_STATIC --> </div>
 * So we must return ONLY the <article> cards, NOT another grid wrapper.
 */
function buildHtml(cardsHtml) {
  if (!cardsHtml.length) {
    return `<p class="muted" style="margin-top:14px;">No teacher training items found right now. Please check back soon.</p>`;
  }
  return cardsHtml.join("\n");
}

function toQuery(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) usp.set(k, String(v));
  return usp.toString();
}

async function main() {
  console.log("[BUILD] Teacher training generator starting…");

  const url =
    `${API_BASE}/group-class/?` +
    toQuery({
      is_deleted: 0,
      title__ORDER: "ASC",
      page: 1,
      limit: 100, // pull enough to filter locally
      fitspot_id: FITSPOT_ID,
      fitspot_id__EQ: FITSPOT_ID,
      company_id: COMPANY_ID,
      company_id__EQ: COMPANY_ID,
      __fd_client: "admin",
      __fd_client_version: "3.1.7",
      __identifier: "site-build",
    });

  console.log("[BUILD] Fetch:", url);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`[BUILD] Fetch failed: ${res.status} ${res.statusText}`);

  const json = await res.json();
  const ok = json?.response?.success;
  if (!ok) throw new Error(`[BUILD] API response not success`);

  const data = json.response.data || {};
  const items = Array.isArray(data.items) ? data.items : [];

  // Filter to “teacher training” items (by title/description/group), then limit.
  const filtered = items
    .filter((it) => {
      if (!TRAINING_KEYWORD) return true;
      const hay = `${it.title || ""} ${it.description || ""} ${it.group_name || ""} ${it.class_group?.name || ""}`
        .toLowerCase();
      return hay.includes(TRAINING_KEYWORD);
    })
    .slice(0, LIMIT);

  const cards = filtered.map(buildCard);
  const html = buildHtml(cards);

  const filePath = path.join(PUBLISH_DIR, "teacher-training.html");
  const raw = await fs.readFile(filePath, "utf8");

  if (!raw.includes(PLACEHOLDER)) {
    throw new Error(
      `[BUILD] Placeholder not found in ${filePath}. Make sure it still contains:\n${PLACEHOLDER}\n\n(If you accidentally committed a “built” version, restore the placeholder in git.)`
    );
  }

  await fs.writeFile(filePath, raw.replace(PLACEHOLDER, html), "utf8");
  console.log(`[BUILD] Updated ${filePath} with ${filtered.length} training items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
