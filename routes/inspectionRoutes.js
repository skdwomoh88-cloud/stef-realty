const express = require("express");

const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const ROLES = require("../constants/roles");
const validate = require("../middleware/validationMiddleware");
const { inspectionScheduleValidator } = require("../validators/assignmentValidator");

const {
  scheduleInspection,
  completeInspection,
  listInspections,
} = require("../controllers/inspectionController");
const { inspectionListQueryValidator } = require("../validators/frontendListValidator");

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  inspectionListQueryValidator,
  validate,
  listInspections
);

router.post(
  "/",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  inspectionScheduleValidator,
  validate,
  scheduleInspection
);

router.put(
  "/:id/complete",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  completeInspection
);

module.exports = router;
