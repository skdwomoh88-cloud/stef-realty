const Property = require("../models/Property");
const PropertySubmission = require("../models/PropertySubmission");
const User = require("../models/User");
const ViewingRequest = require("../models/ViewingRequest");
const asyncHandler = require("../utils/asyncHandler");
const dashboardService = require("../services/dashboardService");

const getDashboardStats = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboardStats();

  res.json({
    success: true,
    data,
  });
});

const getDashboardAnalytics = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboardAnalytics();

  res.json({
    success: true,
    data,
  });
});

const getDashboardActivity = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboardActivity();

  res.json({
    success: true,
    data,
  });
});

module.exports = {
  getDashboardStats,
  getDashboardAnalytics,
  getDashboardActivity,
};