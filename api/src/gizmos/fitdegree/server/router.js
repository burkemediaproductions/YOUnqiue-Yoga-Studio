// api/src/gizmos/fitdegree/server/router.js
import express from "express";
import { fitdegreeFetchJson } from "./client.js";
import { FITDEGREE_ENDPOINTS } from "./endpoints.js";

const router = express.Router();

function resolveEndpoint(value, fallback) {
  // support function endpoints
  if (typeof value === "function") return value();
  // support string endpoints
  if (typeof value === "string" && value.trim()) return value.trim();
  // fallback
  return fallback;
}

router.get("/public/__ping", (_req, res) => {
  res.json({ ok: true, pack: "fitdegree", scope: "public" });
});

router.get("/__ping", (_req, res) => {
  res.json({ ok: true, pack: "fitdegree" });
});

// PUBLIC: instructors (team members)
router.get("/public/instructors", async (req, res) => {
  try {
    const endpoint = resolveEndpoint(
      FITDEGREE_ENDPOINTS.instructors,
      FITDEGREE_ENDPOINTS.TEAM_MEMBERS
    );

    const data = await fitdegreeFetchJson(endpoint, {
      query: {
        // FitDegree often uses these; harmless if ignored
        page: req.query.page,
        limit: req.query.limit,
      },
    });

    res.json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || "Failed to fetch instructors",
      details: err.details || null,
    });
  }
});

// PUBLIC: upcoming classes
router.get("/public/classes", async (req, res) => {
  try {
    const endpoint = resolveEndpoint(
      FITDEGREE_ENDPOINTS.classes,
      FITDEGREE_ENDPOINTS.UPCOMING_CLASSES
    );

    const data = await fitdegreeFetchJson(endpoint, {
      query: {
        page: req.query.page,
        limit: req.query.limit,
      },
    });

    res.json({ ok: true, data });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      error: err.message || "Failed to fetch classes",
      details: err.details || null,
    });
  }
});

export default router;
