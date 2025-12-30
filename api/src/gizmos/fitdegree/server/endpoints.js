// api/src/gizmos/fitdegree/server/endpoints.js

function parseCsvEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : null;
}

/**
 * FitDegree endpoint paths vary between installs.
 * We'll try a list of candidates until we get a successful auth_status.
 *
 * You can override in Render env vars:
 *  - FITDEGREE_ENDPOINT_TEAM_MEMBERS
 *  - FITDEGREE_ENDPOINT_CLASSES
 *
 * Example:
 *  FITDEGREE_ENDPOINT_TEAM_MEMBERS=/api/v1/team_members,/v1/team_members
 */
export const FITDEGREE_ENDPOINT_CANDIDATES = {
  instructors:
    parseCsvEnv('FITDEGREE_ENDPOINT_TEAM_MEMBERS') || [
      // common variants
      '/v1/team-members',
      '/v1/team_members',
      '/v1/instructors',
      '/v1/staff',

      // same variants behind /api prefix
      '/api/v1/team-members',
      '/api/v1/team_members',
      '/api/v1/instructors',
      '/api/v1/staff',
    ],

  classes:
    parseCsvEnv('FITDEGREE_ENDPOINT_CLASSES') || [
      '/v1/classes',
      '/v1/class-schedule',
      '/v1/class_schedule',
      '/v1/upcoming-classes',
      '/v1/upcoming_classes',

      '/api/v1/classes',
      '/api/v1/class-schedule',
      '/api/v1/class_schedule',
      '/api/v1/upcoming-classes',
      '/api/v1/upcoming_classes',
    ],
};
