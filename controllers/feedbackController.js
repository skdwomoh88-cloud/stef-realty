const asyncHandler = require("../utils/asyncHandler");
const feedbackService = require("../services/feedbackService");

const createFeedback = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.createFeedback(req.body);
  res.status(201).json({
    success: true,
    message: "Feedback submitted successfully.",
    data: feedback,
  });
});

const listFeedback = asyncHandler(async (req, res) => {
  const result = await feedbackService.listFeedback(req.query);
  res.status(200).json({
    success: true,
    count: result.feedback.length,
    data: result.feedback,
    pagination: result.pagination,
  });
});

const getFeedbackById = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.getFeedbackById(req.params.id);
  res.status(200).json({ success: true, data: feedback });
});

const updateFeedbackStatus = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.updateFeedbackStatus(
    req.params.id, req.body.status, req.user
  );
  res.status(200).json({
    success: true,
    message: "Feedback status updated successfully.",
    data: feedback,
  });
});

const updateFeedback = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.updateFeedback(req.params.id, req.body);
  res.status(200).json({
    success: true,
    message: "Feedback updated successfully.",
    data: feedback,
  });
});

const archiveFeedback = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.archiveFeedback(req.params.id);
  res.status(200).json({
    success: true,
    message: "Feedback archived successfully.",
    data: feedback,
  });
});

const getMySummary = asyncHandler(async (req, res) => {
  const summary = await feedbackService.getAgentSummary(req.user._id);
  res.status(200).json({ success: true, data: summary });
});

module.exports = {
  createFeedback,
  listFeedback,
  getFeedbackById,
  updateFeedbackStatus,
  updateFeedback,
  archiveFeedback,
  getMySummary,
};
