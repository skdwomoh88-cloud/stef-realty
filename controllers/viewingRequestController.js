const asyncHandler = require("express-async-handler");

const viewingRequestService = require("../services/viewingRequestService");

// Create a viewing request
const createViewingRequest = asyncHandler(async (req, res) => {
  const viewingRequest =
    await viewingRequestService.createViewingRequest(req.body);

  res.status(201).json({
    success: true,
    message: "Viewing request submitted successfully.",
    data: viewingRequest,
  });
});

// Get all viewing requests
const getViewingRequests = asyncHandler(async (req, res) => {
  const viewingRequests =
    await viewingRequestService.getViewingRequests(req.query);

  res.status(200).json({
    success: true,
    count: viewingRequests.length,
    data: viewingRequests,
  });
});

// Get viewing requests for the logged-in user
const getMyViewingRequests = asyncHandler(async (req, res) => {
  const viewingRequests =
    await viewingRequestService.getMyViewingRequests(req.user._id);

  res.status(200).json({
    success: true,
    count: viewingRequests.length,
    data: viewingRequests,
  });
});

// Get a single viewing request
const getViewingRequestById = asyncHandler(async (req, res) => {
  const viewingRequest =
    await viewingRequestService.getViewingRequestById(
      req.params.id,
      req.user
    );

  res.status(200).json({
    success: true,
    data: viewingRequest,
  });
});

// Update viewing request status
const updateViewingStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const viewingRequest =
    await viewingRequestService.updateViewingStatus(
      req.params.id,
      status,
      req.user
    );

  const feedbackToken = viewingRequest.$locals?.feedbackToken;

  res.status(200).json({
    success: true,
    message: "Viewing request status updated successfully.",
    data: viewingRequest,
    ...(feedbackToken ? { feedbackToken } : {}),
  });
});

// Update CRM information
const updateViewingRequest = asyncHandler(async (req, res) => {
  const viewingRequest =
    await viewingRequestService.updateViewingRequest(
      req.params.id,
      req.body,
      req.user
    );

  res.status(200).json({
    success: true,
    message: "Viewing request updated successfully.",
    data: viewingRequest,
  });
});

module.exports = {
  createViewingRequest,
  getViewingRequests,
  getMyViewingRequests,
  getViewingRequestById,
  updateViewingStatus,
  updateViewingRequest,
};
