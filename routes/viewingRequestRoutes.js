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
  adminOnly,
} = require("../middleware/authMiddleware");

// Public
router.post("/", createViewingRequest);

// Admin and Agent
router.get(
  "/my",
  protect,
  getMyViewingRequests
);

// Admin
router.get("/", protect, adminOnly, getViewingRequests);

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

router.put("/:id", protect, adminOnly, updateViewingRequest);

module.exports = router;