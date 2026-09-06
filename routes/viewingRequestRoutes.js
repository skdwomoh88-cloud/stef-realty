const express = require("express");

const router = express.Router();

const ROLES = require("../constants/roles");

const {
  createViewingRequest,
  getViewingRequests,
  getMyViewingRequests,
  getViewingRequestById,
  updateViewingStatus,
  updateViewingRequest,
} = require("../controllers/viewingRequestController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");
const validate = require("../middleware/validationMiddleware");
const {
  createViewingRequestValidator,
  updateViewingRequestValidator,
  updateViewingStatusValidator,
} = require("../validators/viewingRequestValidator");

// Public
router.post(
  "/",
  createViewingRequestValidator,
  validate,
  createViewingRequest
);

// Admin and Agent
router.get(
  "/my",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getMyViewingRequests
);

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  getViewingRequests
);

router.get(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getViewingRequestById
);

router.put(
  "/:id/status",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updateViewingStatusValidator,
  validate,
  updateViewingStatus
);

router.put(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updateViewingRequestValidator,
  validate,
  updateViewingRequest
);

module.exports = router;
