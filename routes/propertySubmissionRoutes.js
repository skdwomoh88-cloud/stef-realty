const express = require("express");

const router = express.Router();

const {
  createSubmission,
  getSubmissions,
  getSubmissionById,
  approveSubmission,
  rejectSubmission,
  assignManager,
  assignAgent,
  updateWorkflow,
  listEligibleAssignees,
} = require("../controllers/propertySubmissionController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");
const ROLES = require("../constants/roles");
const { requirePermission, requireAnyPermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../constants/permissions");
const managementValidator = require("../validators/propertySubmissionManagementValidator");
const validate = require("../middleware/validationMiddleware");
const publicSubmissionValidator = require("../validators/propertySubmissionValidator");
const {
  uploadPropertySubmissionImages,
  validatePropertySubmissionAndCleanup,
} = require("../middleware/propertySubmissionUploadMiddleware");

// Create submission
router.post(
  "/",
  uploadPropertySubmissionImages,
  publicSubmissionValidator,
  validatePropertySubmissionAndCleanup,
  createSubmission
);

// Get all submissions
router.get("/", protect, requireAnyPermission(PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL, PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ASSIGNED), managementValidator.list, validate, getSubmissions);
router.get("/assignees", protect, managementValidator.assignees, validate, listEligibleAssignees);

// Get one submission
router.put("/:id/assign-manager", protect, requirePermission(PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_MANAGER), managementValidator.assignManager, validate, assignManager);
router.put("/:id/assign-agent", protect, requirePermission(PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_AGENT), managementValidator.assignAgent, validate, assignAgent);
router.put("/:id/workflow", protect, requirePermission(PERMISSIONS.PROPERTY_SUBMISSION_UPDATE_WORKFLOW), managementValidator.workflow, validate, updateWorkflow);
router.get("/:id", protect, requireAnyPermission(PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL, PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ASSIGNED), managementValidator.id, validate, getSubmissionById);

// Approve submission
router.put(
  "/:id/approve",
  protect,
  authorize(ROLES.ADMIN),
  approveSubmission
);

router.put(
  "/:id/reject",
  protect,
  authorize(ROLES.ADMIN),
  rejectSubmission
);

module.exports = router;
