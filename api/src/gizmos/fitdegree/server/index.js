/**
 * ServiceUp Gizmo entrypoint (server).
 *
 * Minimal contract:
 *   import fitdegreeGizmo from "./gizmos/fitdegree/server/index.js"
 *   fitdegreeGizmo.register(app) // mounts routes under /api/gizmos/fitdegree
 */
import router from "./router.js";

const fitdegreeGizmo = {
  id: "fitdegree",
  register(app) {
    app.use("/api/gizmos/fitdegree", router);
  },
};

export default fitdegreeGizmo;
