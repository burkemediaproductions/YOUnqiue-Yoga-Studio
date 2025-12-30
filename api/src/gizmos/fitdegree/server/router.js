// api/src/gizmos/fitdegree/server/router.js

import express from 'express';
import { fitdegreeFetchJson } from './client.js';
import { FITDEGREE_ENDPOINT_CANDIDATES } from './endpoints.js';
import { FITDEGREE_FITSPOT_ID } from './config.js';

const router = express.Router();

function getAuthStatus(payload) {
  // FitDegree typically returns: { auth_status: { code, msg }, response: [...] }
  const auth = payload?.auth_status || payload?.data?.auth_status || null;
  const code = typeof auth?.code === 'number' ? auth.code : null;
  const msg = auth?.msg || auth?.message || null;
  return { code, msg };
}

function extractList(payload) {
  // Prefer FitDegree standard
  if (Array.isArray(payload?.response)) return payload.response;

  // Fallback shapes
  if (Array.isArray(payload?.data?.response)) return payload.data.response;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload)) return payload;

  return [];
}

async function fetchFirstWorking(candidates, query = {}) {
  let lastPayload = null;
  let lastError = null;

  for (const endpoint of candidates) {
    try {
      const payload = await fitdegreeFetchJson(endpoint, query);
      lastPayload = payload;

      const { code } = getAuthStatus(payload);

      // If FitDegree includes auth_status, treat code 0 as success.
      // If auth_status is absent, assume HTTP-level success.
      const looksLikeFitdegree = code !== null;

      if (!looksLikeFitdegree) {
        console.log('[FITDEGREE] endpoint ok (no auth_status):', endpoint);
        return { endpoint, payload };
      }

      if (code === 0) {
        console.log('[FITDEGREE] endpoint ok:', endpoint);
        return { endpoint, payload };
      }

      // code 19 = Endpoint not found (your current case)
      console.warn('[FITDEGREE] endpoint rejected:', endpoint, 'code=', code);
      continue;
    } catch (e) {
      lastError = e;
      console.warn('[FITDEGREE] endpoint error:', endpoint, e?.message || e);
      continue;
    }
  }

  // Nothing worked
  const { code, msg } = getAuthStatus(lastPayload);
  const detail =
    code !== null
      ? { auth_status: { code, msg }, lastPayload }
      : { error: lastError?.message || String(lastError || 'Unknown error') };

  const err = new Error('No FitDegree endpoint candidates succeeded.');
  err.detail = detail;
  throw err;
}

// Public ping
router.get('/public/__ping', (_req, res) => {
  res.json({ ok: true, pack: 'fitdegree', ts: Date.now() });
});

// Public instructors
router.get('/public/instructors', async (_req, res) => {
  try {
    const { endpoint, payload } = await fetchFirstWorking(
      FITDEGREE_ENDPOINT_CANDIDATES.instructors,
      { fitspot_id: FITDEGREE_FITSPOT_ID }
    );

    res.json({
      ok: true,
      endpoint_used: endpoint,
      response: extractList(payload),
    });
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: e?.message || 'Failed to fetch instructors',
      detail: e?.detail || null,
      hint:
        'Set FITDEGREE_ENDPOINT_TEAM_MEMBERS in Render to the correct endpoint path(s), comma-separated, if needed.',
    });
  }
});

// Public classes
router.get('/public/classes', async (_req, res) => {
  try {
    const { endpoint, payload } = await fetchFirstWorking(
      FITDEGREE_ENDPOINT_CANDIDATES.classes,
      { fitspot_id: FITDEGREE_FITSPOT_ID }
    );

    res.json({
      ok: true,
      endpoint_used: endpoint,
      response: extractList(payload),
    });
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: e?.message || 'Failed to fetch classes',
      detail: e?.detail || null,
      hint:
        'Set FITDEGREE_ENDPOINT_CLASSES in Render to the correct endpoint path(s), comma-separated, if needed.',
    });
  }
});

export default router;
