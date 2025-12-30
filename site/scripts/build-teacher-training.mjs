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

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toQuery(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) usp.set(k, String(v));
  return usp.toString();
}

function buildGrid(cardsHtml) {
  if (!cardsHtml.length) {
    return `<p class="muted" style="margin-top:14px;">Training info will be posted soon. Please check back.</p>`;
  }
  return `
    <div class="grid cols-3" style="margin-top:18px;">
      ${cardsHtml.join("\n")}
    </div>
  `.trim();
}

function buildTrainingCard(cls) {
  const title = escapeHtml(cls.title || "Teacher Training");
  const desc = escapeHtml((cls.description || "").trim());
  const difficulty = escapeHtml(cls.difficulty_text || "All Levels");

  return `
    <article class="card">
      <h3>${title}</h3>
      <p class="muted" style="margin-top:6px;">${difficulty}</p>
      ${desc ? `<p style="margin-top:10px;">${desc}</p>` : ""}
      <p style="margin-top:14px;">
        <a class="btn btn-primary" href="/book.html#book">Ask / Apply</a>
      </p>
    </article>
  `.trim();
}

async function main() {
  console.log("[BUILD] Teacher Training generator starting…");

  const url =
    `${API_BASE}/group-class/?` +
    toQuery({
      is_deleted: 0,
      title__ORDER: "ASC",
      page: 1,
      limit: 200,
      fitspot_id: FITSPOT_ID,
      fitspot_id__EQ: FITSPOT_ID,
      company_id: COMPANY_ID,
      company_id__EQ: COMPANY_ID,
      __fd_client: "admin",
      __fd_client_version: "3.1.7",
      __identifier: "site-build",
    });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`[BUILD] group-class fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json?.response?.success) throw new Error(`[BUILD] group-class not success`);

  const data = json.response.data || {};
  const items = Array.isArray(data.items) ? data.items : [];

  const training = items.filter((c) => {
    const group = (c.group_name || c.class_group?.name || "").toLowerCase();
    const title = (c.title || "").toLowerCase();
    const desc = (c.description || "").toLowerCase();
    return (
      group.includes("teacher training") ||
      title.includes("teacher training") ||
      desc.includes("teacher training")
    );
  });

  const cards = training.map(buildTrainingCard);
  const html = buildGrid(cards);

  const filePath = path.join(PUBLISH_DIR, "teacher-training.html");
  const raw = await fs.readFile(filePath, "utf8");

  if (!raw.includes(PLACEHOLDER)) {
    throw new Error(`[BUILD] Missing ${PLACEHOLDER} in ${filePath}`);
  }

  await fs.writeFile(filePath, raw.replace(PLACEHOLDER, html), "utf8");
  console.log("[BUILD] Updated teacher-training.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
