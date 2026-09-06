const express = require("express");
const router = express.Router();
const ROLES = require("../constants/roles");

const {
  createInquiry,
  getAllInquiries,
  getMyInquiries,
  getInquiryById,
  updateInquiryStatus,
  assignAgent,
} = require("../controllers/inquiryController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");
const validate = require("../middleware/validationMiddleware");
const {
  createInquiryValidator,
  updateInquiryStatusValidator,
  assignInquiryValidator,
} = require("../validators/inquiryValidator");

// Public
router.post("/", createInquiryValidator, validate, createInquiry);

// Admin
router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  getAllInquiries
);

// Agent
router.get(
  "/my",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getMyInquiries
);

// Admin & Agent
router.get(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getInquiryById
);

router.put(
  "/:id/status",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updateInquiryStatusValidator,
  validate,
  updateInquiryStatus
);

router.put(
  "/:id/assign",
  protect,
  authorize(ROLES.ADMIN),
  assignInquiryValidator,
  validate,
  assignAgent
);

module.exports = router;
