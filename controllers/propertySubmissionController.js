const propertySubmissionService = require("../services/propertySubmissionService");
const { cleanupPropertySubmissionUploads } = require("../middleware/propertySubmissionUploadMiddleware");
const safeErrorMessage = require("../utils/safeErrorMessage");
const asyncHandler = require("express-async-handler");

// Create a new submission
const createSubmission = async (req, res) => {
  try {
    const imageUrls = req.files.map((file) =>
      `${req.protocol}://${req.get("host")}/uploads/property-submissions/${file.filename}`
    );
    const submission = await propertySubmissionService.createSubmission(
      req.body,
      imageUrls
    );

    res.status(201).json({
      submissionReference: submission.submissionReference,
    });
  } catch (error) {
    await cleanupPropertySubmissionUploads(req.files).catch(() => {});
    res.status(400).json({
      message: safeErrorMessage(error),
    });
  }
};

// Get all submissions
const getSubmissions = asyncHandler(async (req, res) => {
  const result = await propertySubmissionService.getSubmissions(req.query, req.user);
  res.json({ success: true, data: result.submissions, pagination: result.pagination });
});

// Get one submission
const getSubmissionById = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await propertySubmissionService.getSubmissionById(req.params.id, req.user) });
});

const assignManager = asyncHandler(async (req, res) => {
  const submission = await propertySubmissionService.assignManager(req.params.id, req.body.assignedManager, req.user, req);
  res.json({ success: true, message: "Property Submission manager assigned.", data: submission });
});

const assignAgent = asyncHandler(async (req, res) => {
  const submission = await propertySubmissionService.assignAgent(req.params.id, req.body.assignedAgent, req.user, req);
  res.json({ success: true, message: "Property Submission Agent assigned.", data: submission });
});

const updateWorkflow = asyncHandler(async (req, res) => {
  const submission = await propertySubmissionService.updateWorkflow(req.params.id, req.body, req.user, req);
  res.json({ success: true, message: "Property Submission workflow updated.", data: submission });
});
const listEligibleAssignees = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await propertySubmissionService.listEligibleAssignees(req.query.kind, req.user) });
});

// Approve submission
const approveSubmission = async (req, res) => {
  try {
    const property =
      await propertySubmissionService.approveSubmission(
        req.params.id,
        req.user
      );

    res.json({
      message: "Submission approved successfully.",
      property,
    });
  } catch (error) {
    res.status(400).json({
      message: safeErrorMessage(error),
    });
  }
};

// Reject submission
const rejectSubmission = async (req, res) => {
  try {
    await propertySubmissionService.rejectSubmission(
      req.params.id
    );

    res.json({
      message: "Submission rejected.",
    });
  } catch (error) {
    res.status(400).json({
      message: safeErrorMessage(error),
    });
  }
};

module.exports = {
  createSubmission,
  getSubmissions,
  getSubmissionById,
  assignManager,
  assignAgent,
  updateWorkflow,
  listEligibleAssignees,
  approveSubmission,
  rejectSubmission,
};
