// scripts/build-classes-services.mjs
import fs from "node:fs/promises";
import path from "node:path";

const FITSPOT_ID = process.env.FITSPOT_ID?.trim() || "782";
const COMPANY_ID = process.env.COMPANY_ID?.trim() || "726";

const API_BASE =
  process.env.FITDEGREE_API_BASE?.trim().replace(/\/+$/, "") ||
  "https://api.fitdegree.com";

const PUBLISH_DIR = process.env.PUBLISH_DIR?.trim() || ".";

const PLACEHOLDER_CLASSES = "<!-- CLASS_TYPES_STATIC -->";
const PLACEHOLDER_SERVICES = "<!-- ONE_ON_ONE_STATIC -->";

// Optional: cap how many “class types” cards to show
const CLASS_TYPES_LIMIT = Number(process.env.CLASS_TYPES_LIMIT || 12);

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function moneyFromCents(maybeCents) {
  const n = Number(maybeCents);
  if (!Number.isFinite(n)) return null;
  // FitDegree is typically cents; your 7000 reads like $70.00
  return (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function toQuery(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) usp.set(k, String(v));
  return usp.toString();
}

function buildGrid(cardsHtml) {
  if (!cardsHtml.length) {
    return `<p class="muted" style="margin-top:14px;">Nothing to show right now. Please check back soon.</p>`;
  }
  return '
      ${cardsHtml.join("\n")}
  `.trim();
}

function buildClassTypeCard(cls) {
  const title = escapeHtml(cls.title || "Class");
  const desc = escapeHtml((cls.description || "").trim());
  const group = escapeHtml(cls.group_name || cls.class_group?.name || "");
  const difficulty = escapeHtml(cls.difficulty_text || "");

  return `
    <article class="card">
      <h3>${title}</h3>
      <p class="muted" style="margin-top:6px;">
        ${group}${difficulty ? ` · ${difficulty}` : ""}
      </p>
      ${desc ? `<p style="margin-top:10px;">${desc}</p>` : ""}
      <p style="margin-top:14px;">
        <a class="btn btn-primary" href="/book.html#book">See Schedule</a>
      </p>
    </article>
  `.trim();
}

function buildServiceCard(svc, imageUrl, durations) {
  const name = escapeHtml(svc.name || "Service");
  const desc = escapeHtml((svc.description || "").trim());
  const priceLine =
    durations?.length
      ? durations
          .map((d) => {
            const mins = Number(d.duration);
            const price = moneyFromCents(d.base_price);
            if (!mins && !price) return null;
            return `${mins ? `${mins} min` : ""}${mins && price ? " · " : ""}${price || ""}`.trim();
          })
          .filter(Boolean)
          .join(" / ")
      : "";

  const img = imageUrl
    ? `<img class="avatar" src="${escapeHtml(imageUrl)}" alt="${name}" loading="lazy" decoding="async" />`
    : "";

  return `
    <article class="card">
      ${img}
      <h3>${name}</h3>
      ${priceLine ? `<p class="muted" style="margin-top:6px;">${escapeHtml(priceLine)}</p>` : ""}
      ${desc ? `<p style="margin-top:10px;">${desc}</p>` : ""}
      <p style="margin-top:14px;">
        <a class="btn btn-primary" href="/book.html#book">Book</a>
      </p>
    </article>
  `.trim();
}

async function fetchGroupClasses() {
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
  return json.response.data || {};
}

async function fetchServices() {
  const url =
    `${API_BASE}/one-on-one/service/?` +
    toQuery({
      is_deleted: 0,
      name__ORDER: "ASC",
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
  if (!res.ok) throw new Error(`[BUILD] one-on-one/service fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json?.response?.success) throw new Error(`[BUILD] one-on-one/service not success`);
  return json.response.data || {};
}

async function main() {
  console.log("[BUILD] Classes & Services generator starting…");

  // 1) class types
  const groupClassData = await fetchGroupClasses();
  const classItems = Array.isArray(groupClassData.items) ? groupClassData.items : [];

  // Exclude teacher training from this page (we’ll render it on its own page)
  const classTypes = classItems
    .filter((c) => {
      const group = (c.group_name || c.class_group?.name || "").toLowerCase();
      const title = (c.title || "").toLowerCase();
      return !(group.includes("teacher training") || title.includes("teacher training"));
    })
    .slice(0, CLASS_TYPES_LIMIT);

  const classCards = classTypes.map(buildClassTypeCard);
  const classHtml = buildGrid(classCards);

  // 2) one-on-one
  const serviceData = await fetchServices();
  const services = Array.isArray(serviceData.items) ? serviceData.items : [];

  const cacheImages = serviceData.cache?.images || [];
  const cacheDurations = serviceData.cache?.ooo_durations || [];

  const imageById = new Map(cacheImages.map((img) => [String(img.id), img]));
  const durationsByServiceId = new Map();
  for (const d of cacheDurations) {
    const sid = String(d.service_id);
    if (!durationsByServiceId.has(sid)) durationsByServiceId.set(sid, []);
    durationsByServiceId.get(sid).push(d);
  }

  const serviceCards = services
    .filter((s) => s.display_on_app !== false)
    .map((svc) => {
      const imgObj = svc.image_id ? imageById.get(String(svc.image_id)) : null;
      const imageUrl = pickImageUrl(imgObj);
      const durations = durationsByServiceId.get(String(svc.id)) || [];
      return buildServiceCard(svc, imageUrl, durations);
    });

  const servicesHtml = buildGrid(serviceCards);

  // Write into classes-services.html
  const filePath = path.join(PUBLISH_DIR, "classes-services.html");
  const raw = await fs.readFile(filePath, "utf8");

  if (!raw.includes(PLACEHOLDER_CLASSES)) {
    throw new Error(`[BUILD] Missing ${PLACEHOLDER_CLASSES} in ${filePath}`);
  }
  if (!raw.includes(PLACEHOLDER_SERVICES)) {
    throw new Error(`[BUILD] Missing ${PLACEHOLDER_SERVICES} in ${filePath}`);
  }

  let updated = raw.replace(PLACEHOLDER_CLASSES, classHtml);
  updated = updated.replace(PLACEHOLDER_SERVICES, servicesHtml);

  await fs.writeFile(filePath, updated, "utf8");
  console.log("[BUILD] Updated classes-services.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
