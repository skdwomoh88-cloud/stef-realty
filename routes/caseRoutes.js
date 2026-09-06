const express = require("express");

const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");

const ROLES = require("../constants/roles");
const validate = require("../middleware/validationMiddleware");
const { caseAssignmentValidator } = require("../validators/assignmentValidator");

const {
  createCase,
  assignAgent,
  getCase,
  listCases,
} = require("../controllers/caseController");
const { caseListQueryValidator } = require("../validators/frontendListValidator");

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT, ROLES.OWNER),
  caseListQueryValidator,
  validate,
  listCases
);

router.post(
  "/",
  protect,
  authorize(ROLES.ADMIN, ROLES.OWNER),
  createCase
);

router.get(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT, ROLES.OWNER),
  getCase
);

router.put(
  "/:id/assign-agent",
  protect,
  authorize(ROLES.ADMIN),
  caseAssignmentValidator,
  validate,
  assignAgent
);

module.exports = router;
