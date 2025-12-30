// scripts/build-schedule.mjs
import fs from "node:fs/promises";
import path from "node:path";

const FITSPOT_ID = process.env.FITSPOT_ID?.trim() || "782";
const COMPANY_ID = process.env.COMPANY_ID?.trim() || "726";

const API_BASE =
  process.env.FITDEGREE_API_BASE?.trim().replace(/\/+$/, "") ||
  "https://api.fitdegree.com";

const PUBLISH_DIR = process.env.PUBLISH_DIR?.trim() || ".";
const PLACEHOLDER = "<!-- SCHEDULE_STATIC -->";

// How many schedule cards to show
const LIMIT = Number(process.env.SCHEDULE_CARD_LIMIT || 6);

// How many days ahead to pull
const DAYS_AHEAD = Number(process.env.SCHEDULE_DAYS_AHEAD || 14);

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPrettyDateTime(value) {
  if (!value) return ""; // <-- prevents .replace crash

  // value is usually "YYYY-MM-DD HH:MM:SS"
  const str = String(value);

  // Force a parseable ISO-ish string
  const d = new Date(str.replace(" ", "T") + (str.length === 19 ? "" : ""));

  if (Number.isNaN(d.getTime())) {
    // last resort: return original
    return str;
  }

  const date = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const time = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
    .toLowerCase();

  return `${date} • ${time}`;
}

function buildCard(item) {
  const title = escapeHtml(item.title || "Class");
  const instructor = escapeHtml(item.instructor_name || "");
  const dt =
    item.fs_event_datetime ||
    item.event_datetime ||
    item.fs_end_datetime ||
    item.end_datetime ||
    "";

  const whenPretty = formatPrettyDateTime(dt);
  const when = whenPretty ? escapeHtml(whenPretty) : "";
  const descRaw = (item.description || "").trim();
  const desc = escapeHtml(descRaw);

  const bookHref = item.share_url ? item.share_url : "/book.html#book";

  return `
    <article class="card">
      <h3>${title}</h3>
      <p class="muted" style="margin-top:6px;">
          ${when ? when : "Time TBD"}${instructor ? ` · ${instructor}` : ""}
      </p>
      ${desc ? `<p style="margin-top:10px;">${desc}</p>` : ""}
      <p style="margin-top:14px;">
        <a class="btn btn-primary" href="${escapeHtml(bookHref)}" target="_blank" rel="noopener">Book</a>
      </p>
    </article>
  `.trim();
}

function buildGrid(cardsHtml) {
  if (!cardsHtml.length) {
    return `<p class="muted" style="margin-top:14px;">No upcoming classes found right now. Please check back soon.</p>`;
  }

  return `
    <div class="grid cols-3" style="margin-top:18px;">
      ${cardsHtml.join("\n")}
    </div>
  `.trim();
}

function toQuery(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    usp.set(k, String(v));
  }
  return usp.toString();
}

function getDateRange() {
  // Start today 00:00 local (we’re using yyyy-mm-dd 06:00:00 in your example,
  // but FitDegree returns fs_* time anyway — this is fine as a wide net).
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(start.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

  const fmt = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} 00:00:00`;
  };

  return { start: fmt(start), end: fmt(end) };
}

async function main() {
  console.log("[BUILD] Schedule generator starting…");

  const { start, end } = getDateRange();

  const url =
    `${API_BASE}/schedule/item/?` +
    toQuery({
      // from your working example:
      object_type__IN: '["1","2","22","4"]',
      show_past: "false",
      published_status__IN: "[1]",
      show_no_instructor: "true",
      is_cancelled__IN: "[0]",
      start_datetime: start,
      end_datetime: end,
      fitspot_id: FITSPOT_ID,
      fitspot_id__EQ: FITSPOT_ID,
      company_id: COMPANY_ID,
      company_id__EQ: COMPANY_ID,
      // optional client markers (not required, but matches your calls)
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

  // Upcoming only, sorted by fs_event_datetime (fitspot time)
  const upcoming = items
    .filter((it) => !it.past)
    .sort((a, b) => String(a.fs_event_datetime || "").localeCompare(String(b.fs_event_datetime || "")))
    .slice(0, LIMIT);

  const cards = upcoming.map(buildCard);
  const html = buildGrid(cards);

  const bookPath = path.join(PUBLISH_DIR, "book.html");
  const raw = await fs.readFile(bookPath, "utf8");

  if (!raw.includes(PLACEHOLDER)) {
    throw new Error(`[BUILD] Placeholder not found in ${bookPath}. Add:\n${PLACEHOLDER}`);
  }

  await fs.writeFile(bookPath, raw.replace(PLACEHOLDER, html), "utf8");
  console.log(`[BUILD] Updated ${bookPath} with ${upcoming.length} schedule items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
