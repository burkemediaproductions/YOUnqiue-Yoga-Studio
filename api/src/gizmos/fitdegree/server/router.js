import express from "express";
import { getFitDegreeConfig } from "./config.js";
import { FITDEGREE_ENDPOINTS } from "./endpoints.js";

const router = express.Router();

/**
 * Public ping — should work WITHOUT a token:
 *   /api/gizmos/fitdegree/public/__ping
 */
router.get("/public/__ping", (_req, res) => {
  res.json({ ok: true, pack: "fitdegree", scope: "public" });
});

/**
 * Protected ping — will require token because it is NOT under /public:
 *   /api/gizmos/fitdegree/__ping
 */
router.get("/__ping", (_req, res) => {
  res.json({ ok: true, pack: "fitdegree", scope: "protected" });
});

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

function normalizeTeamMember(m) {
  if (!m || typeof m !== "object") return null;
  return {
    id: m.id || m.uuid || m._id || null,
    name: m.name || m.full_name || m.fullName || "",
    title: m.title || m.role || "",
    bio: m.bio || m.description || "",
    image: m.image || m.photo || m.avatar || "",
    raw: m,
  };
}

/**
 * PUBLIC: instructors list
 * GET /api/gizmos/fitdegree/public/instructors?fitspot_id=123
 */
router.get("/public/instructors", async (req, res) => {
  try {
    const fitspotId = req.query.fitspot_id || req.query.fitspotId;
    const cfg = await getFitDegreeConfig({ fitspotId });

    const url = FITDEGREE_ENDPOINTS.instructors(cfg);
    const r = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
    });

    const json = await r.json().catch(() => null);

    if (!r.ok) {
      return res.status(r.status).json({
        ok: false,
        error: "FitDegree request failed",
        status: r.status,
        detail: json,
      });
    }

    const list =
      json?.instructors ||
      json?.data ||
      json?.results ||
      asArray(json);

    res.json({
      ok: true,
      instructors: asArray(list).map(normalizeTeamMember).filter(Boolean),
    });
  } catch (e) {
    console.error("[fitdegree/public/instructors]", e);
    res.status(500).json({ ok: false, error: e?.message || "Server error" });
  }
});

export default router;
