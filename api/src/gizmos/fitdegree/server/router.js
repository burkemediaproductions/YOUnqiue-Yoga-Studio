import express from "express";
import { getFitDegreeConfig } from "./config.js";
import { FITDEGREE_ENDPOINTS } from "./endpoints.js";
import { fitdegreeFetchJson } from "./client.js";
import { normalizeClassItem, normalizeTeamMember } from "./normalize.js";

const router = express.Router();

// Simple per-process cache
const CACHE = new Map();
const cacheGet = (k) => {
  const hit = CACHE.get(k);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { CACHE.delete(k); return null; }
  return hit.value;
};
const cacheSet = (k, v, ttlMs) => CACHE.set(k, { value: v, expiresAt: Date.now() + ttlMs });

// GET /api/gizmos/fitdegree/public/featured-classes?days=7&limit=6
router.get("/public/featured-classes", async (req, res) => {
  try {
    const cfg = getFitDegreeConfig();
    const fitspotId = req.query.fitspotId || cfg.fitspotId;

    const days = Math.max(1, Math.min(30, Number(req.query.days || 7)));
    const limit = Math.max(1, Math.min(24, Number(req.query.limit || 6)));

    if (!fitspotId) return res.status(400).json({ ok:false, error:"Missing FITDEGREE_FITSPOT_ID (or fitspotId query)" });

    const cacheKey = `featured:${fitspotId}:${days}:${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    const end = new Date(now.getTime() + days * 86400000);

    const payload = await fitdegreeFetchJson(FITDEGREE_ENDPOINTS.UPCOMING_CLASSES, {
      query: { fitspot_id: fitspotId, start: now.toISOString(), end: end.toISOString(), limit },
    });

    const list = Array.isArray(payload) ? payload : (payload?.data || payload?.items || []);
    const out = list.map(normalizeClassItem).filter(x => x && x.start_at)
      .sort((a,b)=> new Date(a.start_at)-new Date(b.start_at))
      .slice(0, limit);

    cacheSet(cacheKey, out, 60000);
    res.json(out);
  } catch (err) {
    res.status(err.status || 500).json({ ok:false, error: err.message || "Server error", details: err.details || null });
  }
});

// GET /api/gizmos/fitdegree/public/instructors
router.get("/public/instructors", async (req, res) => {
  try {
    const cfg = getFitDegreeConfig();
    const fitspotId = req.query.fitspotId || cfg.fitspotId;

    if (!fitspotId) return res.status(400).json({ ok:false, error:"Missing FITDEGREE_FITSPOT_ID (or fitspotId query)" });

    const cacheKey = `instructors:${fitspotId}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const payload = await fitdegreeFetchJson(FITDEGREE_ENDPOINTS.TEAM_MEMBERS, {
      query: { fitspot_id: fitspotId },
    });

    const list = Array.isArray(payload) ? payload : (payload?.data || payload?.items || []);
    const out = list.map(normalizeTeamMember).filter(x => x && x.name);

    cacheSet(cacheKey, out, 10 * 60000);
    res.json(out);
  } catch (err) {
    res.status(err.status || 500).json({ ok:false, error: err.message || "Server error", details: err.details || null });
  }
});

export default router;
