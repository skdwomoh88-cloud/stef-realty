const express = require("express");

const router = express.Router();

const {
  createSubmission,
  getSubmissions,
  getSubmissionById,
  approveSubmission,
  rejectSubmission,
} = require("../controllers/propertySubmissionController");

// Create submission
router.post("/", createSubmission);

// Get all submissions
router.get("/", getSubmissions);

// Get one submission
router.get("/:id", getSubmissionById);

// Approve submission
router.put("/:id/approve", approveSubmission);

// Reject submission
router.put("/:id/reject", rejectSubmission);

module.exports = router;