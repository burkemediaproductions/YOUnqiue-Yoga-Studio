/**
 * FitDegree Gizmo entrypoint (server).
 *
 * Contract:
 *   - default export is an object with register(app)
 *   - register mounts routes under /api/gizmos/<id>
 *
 * The router should include your public endpoints like:
 *   GET /public/instructors
 */
import router from './router.js';

const fitdegreeGizmo = {
  id: 'fitdegree',
  register(app) {
    app.use(`/api/gizmos/${this.id}`, router);
  },
};

export default fitdegreeGizmo;
