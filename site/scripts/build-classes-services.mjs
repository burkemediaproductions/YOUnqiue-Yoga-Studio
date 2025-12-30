// scripts/build-classes-services.mjs
import fs from "node:fs/promises";
import path from "node:path";

const FITSPOT_ID = process.env.FITSPOT_ID?.trim() || "782";
const COMPANY_ID = process.env.COMPANY_ID?.trim() || "726";

const API_BASE =
  process.env.FITDEGREE_API_BASE?.trim().replace(/\/+$/, "") ||
  "https://api.fitdegree.com";

const PUBLISH_DIR = process.env.PUBLISH_DIR?.trim() || ".";
const OUT_FILE = path.join(PUBLISH_DIR, "classes-services.html");

const PLACEHOLDER_CLASSES = "<!-- CLASS_TYPES_STATIC -->";
const PLACEHOLDER_SERVICES = "<!-- ONE_ON_ONE_STATIC -->";

const LIMIT = Number(process.env.CLASS_TYPES_LIMIT || 12);

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanText(str) {
  return String(str ?? "").trim();
}

function buildClassCard(item) {
  const title = escapeHtml(item.title || "Class");
  const group = escapeHtml(item.group_name || item?.class_group?.name || "");
  const difficulty = escapeHtml(item.difficulty_text || "");
  const desc = escapeHtml(cleanText(item.description || ""));

  // For classes, just push people to booking
  const href = "/book.html#book";

  return `
<article class="card">
  <h3>${title}</h3>
  <p class="muted" style="margin-top:6px;">
    ${group}${difficulty ? ` · ${difficulty}` : ""}
  </p>
  ${desc ? `<p style="margin-top:10px;">${desc}</p>` : ""}
  <p style="margin-top:14px;">
    <a class="btn btn-primary" href="${href}">See Schedule</a>
  </p>
</article>
  `.trim();
}

function buildServiceCard(item) {
  const name = escapeHtml(item.name || "Service");

  // prefer full description if present, otherwise preview, otherwise blank
  const raw =
    cleanText(item.description || "") ||
    cleanText(item.description_preview || "");

  const desc = escapeHtml(raw);

  // Services book via widget, but still link to Book page
  const href = "/book.html#book";

  return `
<article class="card">
  <h3>${name}</h3>
  ${desc ? `<p style="margin-top:10px;">${desc}</p>` : ""}
  <p style="margin-top:14px;">
    <a class="btn btn-primary" href="${href}">Book</a>
  </p>
</article>
  `.trim();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[BUILD] Fetch failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

async function main() {
  console.log("[BUILD] Classes & Services generator starting…");

  const classesUrl =
    `${API_BASE}/group-class/?` +
    new URLSearchParams({
      is_deleted: "0",
      title__ORDER: "ASC",
      page: "1",
      limit: String(LIMIT),
      fitspot_id: FITSPOT_ID,
      fitspot_id__EQ: FITSPOT_ID,
      company_id: COMPANY_ID,
      company_id__EQ: COMPANY_ID,
      __fd_client: "admin",
      __fd_client_version: "3.1.7",
      __identifier: "site-build",
    }).toString();

  const servicesUrl =
    `${API_BASE}/one-on-one/service/?` +
    new URLSearchParams({
      is_deleted: "0",
      name__ORDER: "ASC",
      page: "1",
      limit: "50",
      fitspot_id: FITSPOT_ID,
      fitspot_id__EQ: FITSPOT_ID,
      company_id: COMPANY_ID,
      company_id__EQ: COMPANY_ID,
      __fd_client: "admin",
      __fd_client_version: "3.1.7",
      __identifier: "site-build",
    }).toString();

  console.log("[BUILD] Fetch classes:", classesUrl);
  const classesJson = await fetchJson(classesUrl);
  if (!classesJson?.response?.success) throw new Error("[BUILD] group-class response not success");

  console.log("[BUILD] Fetch services:", servicesUrl);
  const servicesJson = await fetchJson(servicesUrl);
  if (!servicesJson?.response?.success) throw new Error("[BUILD] one-on-one/service response not success");

  const classItems = Array.isArray(classesJson?.response?.data?.items)
    ? classesJson.response.data.items
    : [];

  const serviceItems = Array.isArray(servicesJson?.response?.data?.items)
    ? servicesJson.response.data.items
    : [];

  // Classes (group-class includes training too — you can filter later if desired)
  const classesHtml = classItems.length
    ? classItems.map(buildClassCard).join("\n")
    : `<p class="muted" style="margin-top:14px;">No classes found right now.</p>`;

  // Services
  const servicesHtml = serviceItems.length
    ? serviceItems.map(buildServiceCard).join("\n")
    : `<p class="muted" style="margin-top:14px;">No services found right now.</p>`;

  const raw = await fs.readFile(OUT_FILE, "utf8");

  if (!raw.includes(PLACEHOLDER_CLASSES)) {
    throw new Error(`[BUILD] Placeholder not found in ${OUT_FILE}: ${PLACEHOLDER_CLASSES}`);
  }
  if (!raw.includes(PLACEHOLDER_SERVICES)) {
    throw new Error(`[BUILD] Placeholder not found in ${OUT_FILE}: ${PLACEHOLDER_SERVICES}`);
  }

  const updated = raw
    .replace(PLACEHOLDER_CLASSES, classesHtml)
    .replace(PLACEHOLDER_SERVICES, servicesHtml);

  await fs.writeFile(OUT_FILE, updated, "utf8");

  console.log(`[BUILD] Updated ${OUT_FILE} with ${classItems.length} classes and ${serviceItems.length} services.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
