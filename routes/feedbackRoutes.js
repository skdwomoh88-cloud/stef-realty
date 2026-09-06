const express = require("express");
const router = express.Router();
const ROLES = require("../constants/roles");
const { protect, authorize } = require("../middleware/authMiddleware");
const validate = require("../middleware/validationMiddleware");
const controller = require("../controllers/feedbackController");
const {
  feedbackSubmissionValidator,
  feedbackIdValidator,
  feedbackStatusValidator,
  feedbackUpdateValidator,
  feedbackListValidator,
} = require("../validators/feedbackValidator");

router.post("/", feedbackSubmissionValidator, validate, controller.createFeedback);

router.get(
  "/my/summary",
  protect,
  authorize(ROLES.AGENT),
  controller.getMySummary
);

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  feedbackListValidator,
  validate,
  controller.listFeedback
);
router.get(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  feedbackIdValidator,
  validate,
  controller.getFeedbackById
);
router.put(
  "/:id/status",
  protect,
  authorize(ROLES.ADMIN),
  feedbackStatusValidator,
  validate,
  controller.updateFeedbackStatus
);
router.put(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  feedbackUpdateValidator,
  validate,
  controller.updateFeedback
);
router.delete(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  feedbackIdValidator,
  validate,
  controller.archiveFeedback
);

module.exports = router;
