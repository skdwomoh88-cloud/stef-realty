const express = require("express");

const router = express.Router();

const {
  getDashboardStats,
  getDashboardAnalytics,
  getDashboardActivity,
} = require("../controllers/dashboardController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

router.get(
  "/stats",
  protect,
  authorize("Admin"),
  getDashboardStats
);

router.get(
  "/analytics",
  protect,
  authorize("Admin"),
  getDashboardAnalytics
);

router.get(
  "/activity",
  protect,
  authorize("Admin"),
  getDashboardActivity
);

module.exports = router;