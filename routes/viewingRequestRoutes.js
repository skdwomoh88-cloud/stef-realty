const express = require("express");

const router = express.Router();

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

// Public
router.post("/", createViewingRequest);

// Admin and Agent
router.get(
  "/my",
  protect,
  getMyViewingRequests
);

router.get(
  "/",
  protect,
  authorize("Admin", "Agent"),
  getViewingRequests
);

router.get(
  "/:id",
  protect,
  getViewingRequestById
);

router.put(
  "/:id/status",
  protect,
  updateViewingStatus
);

router.put(
  "/:id",
  protect,
  authorize("Admin", "Agent"),
  updateViewingRequest
);

module.exports = router;