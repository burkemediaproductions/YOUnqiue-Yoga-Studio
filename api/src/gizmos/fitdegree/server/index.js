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
import express from "express";
import router from "./router.js";

const fitdegreeGizmo = {
  id: "fitdegree",
  register(app) {
    // 🔥 debug proof route
    app.get(`/api/gizmos/${this.id}/public/__ping`, (_req, res) => {
      res.json({ ok: true, gizmo: this.id });
    });

    app.use(`/api/gizmos/${this.id}`, router);
  },
};

export default fitdegreeGizmo;
