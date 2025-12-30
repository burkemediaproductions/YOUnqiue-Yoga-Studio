// api/src/gizmos/fitdegree/server/client.js
import fetch from "node-fetch";

/**
 * FitDegree API client helper
 *
 * Env:
 *  - FITDEGREE_API_BASE (default https://api.fitdegree.com)
 *  - FITDEGREE_API_KEY
 *  - FITDEGREE_AUTH_HEADER (default Authorization)
 *  - FITDEGREE_AUTH_SCHEME (default Bearer)
 */

function getCfg() {
  const baseUrl = (process.env.FITDEGREE_API_BASE || "https://api.fitdegree.com").trim();
  const apiKey = (process.env.FITDEGREE_API_KEY || "").trim();
  const authHeader = (process.env.FITDEGREE_AUTH_HEADER || "Authorization").trim();
  const authScheme = (process.env.FITDEGREE_AUTH_SCHEME || "Bearer").trim();

  return { baseUrl, apiKey, authHeader, authScheme };
}

function joinUrl(baseUrl, endpointPath) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  let p = String(endpointPath || "");
  if (!p.startsWith("/")) p = "/" + p;
  return base + p;
}

function buildUrlWithQuery(url, query) {
  if (!query || typeof query !== "object") return url;
  const usp = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    usp.searchParams.set(k, String(v));
  }
  return usp.toString();
}

function looksLikeEndpointNotFound(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    payload.auth_status &&
    Number(payload.auth_status.code) === 19
  );
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

/**
 * Generate common FitDegree endpoint variants:
 * - /v1 vs /api/v1 vs /api
 * - TEAM_MEMBERS vs team_members vs team-members
 * - keep original too
 */
function endpointVariants(originalPath) {
  const inPath = String(originalPath || "").trim();
  if (!inPath) return [];

  // Ensure we only deal with path portion
  let pathOnly = inPath;
  // If someone passes a full URL, strip to pathname
  try {
    if (/^https?:\/\//i.test(pathOnly)) {
      const u = new URL(pathOnly);
      pathOnly = u.pathname || "/";
    }
  } catch {
    // ignore
  }

  if (!pathOnly.startsWith("/")) pathOnly = "/" + pathOnly;

  // Split prefix + last segment
  const parts = pathOnly.split("/").filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : "";
  const prefixParts = parts.slice(0, -1);
  const prefix = "/" + prefixParts.join("/"); // may be "/"

  const candidatesName = uniq([
    last,
    last.toLowerCase(),
    last.toUpperCase(),
    last.replace(/-/g, "_"),
    last.replace(/_/g, "-"),
    last.replace(/-/g, "_").toLowerCase(),
    last.replace(/_/g, "-").toLowerCase(),
    last.replace(/-/g, "_").toUpperCase(),
    last.replace(/_/g, "-").toUpperCase(),
  ]);

  // Candidate prefixes to try (these cover the most common API shapes)
  const prefixCandidates = uniq([
    prefix === "/" ? "" : prefix, // original prefix as-is
    "/v1",
    "/api/v1",
    "/api",
    "", // root
  ]);

  const out = [];

  // 1) Try original first
  out.push(pathOnly);

  // 2) Try combinations of alternate prefixes + name variants
  for (const pref of prefixCandidates) {
    for (const nm of candidatesName) {
      const p = (pref || "") + "/" + nm;
      out.push(p.replace(/\/{2,}/g, "/"));
    }
  }

  // 3) Also try keeping original prefix but swapping name variants
  for (const nm of candidatesName) {
    const p = (prefix === "/" ? "" : prefix) + "/" + nm;
    out.push(p.replace(/\/{2,}/g, "/"));
  }

  return uniq(out);
}

async function doOneFetch(endpointPath, options = {}) {
  const cfg = getCfg();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (cfg.apiKey) {
    headers[cfg.authHeader] = cfg.authScheme
      ? `${cfg.authScheme} ${cfg.apiKey}`
      : cfg.apiKey;
  }

  const url = buildUrlWithQuery(joinUrl(cfg.baseUrl, endpointPath), options.query);

  const resp = await fetch(url, {
    method: options.method || "GET",
    headers,
  });

  let payloadText = "";
  let payload = null;

  try {
    payloadText = await resp.text();
    payload = payloadText ? JSON.parse(payloadText) : null;
  } catch {
    payload = payloadText || null;
  }

  return { url, status: resp.status, ok: resp.ok, payload };
}

/**
 * Public helper: fetch JSON from FitDegree with automatic fallback retries
 * when FitDegree returns auth_status.code=19 (Endpoint not found).
 */
export async function fitdegreeFetchJson(endpointPath, options = {}) {
  const tried = [];
  const variants = endpointVariants(endpointPath);

  for (const path of variants) {
    tried.push(path);

    const { url, status, payload } = await doOneFetch(path, options);

    // If it's NOT the endpoint-not-found payload, return it immediately.
    if (!looksLikeEndpointNotFound(payload)) {
      // Attach debug to help while wiring this up
      if (payload && typeof payload === "object") {
        return {
          ...payload,
          _debug: {
            requested: endpointPath,
            resolved: path,
            url,
            status,
            tried: tried.slice(0, 25), // keep it small
          },
        };
      }

      return {
        ok: true,
        data: payload,
        _debug: { requested: endpointPath, resolved: path, url, status, tried: tried.slice(0, 25) },
      };
    }
  }

  // If everything failed with endpoint-not-found, return the last payload with debug.
  const lastPath = variants[variants.length - 1] || endpointPath;
  const last = await doOneFetch(lastPath, options);

  return {
    ok: true,
    data: last.payload,
    _debug: {
      requested: endpointPath,
      resolved: lastPath,
      url: last.url,
      status: last.status,
      tried: tried.slice(0, 50),
      note: "All endpoint variants returned auth_status.code=19 (Endpoint not found).",
    },
  };
}
