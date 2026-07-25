const express = require("express");

const router = express.Router();

const {
  createSubmission,
  getSubmissions,
  getSubmissionById,
  approveSubmission,
  rejectSubmission,
} = require("../controllers/propertySubmissionController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

// Create submission
router.post("/", createSubmission);

// Get all submissions
router.get("/", getSubmissions);

// Get one submission
router.get("/:id", getSubmissionById);

// Approve submission
router.put(
  "/:id/approve",
  protect,
  authorize("Admin"),
  approveSubmission
);

router.put(
  "/:id/reject",
  protect,
  authorize("Admin"),
  rejectSubmission
);

module.exports = router;