const { body, param, query } = require("express-validator");
const FEEDBACK_STATUS = require("../constants/feedbackStatus");

const categoryRatings = [
  "professionalismRating", "communicationRating", "punctualityRating", "knowledgeRating",
];
const clientControlledForbidden = [
  "feedbackNumber", "property", "agent", "clientName", "clientEmail", "status",
  "adminNotes", "reviewedBy", "reviewedAt",
];

const feedbackSubmissionValidator = [
  body("viewingRequest").isMongoId().withMessage("Invalid viewing request ID"),
  body("feedbackToken").isString().isLength({ min: 64, max: 64 }).withMessage("Invalid feedback token"),
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5").toInt(),
  body("review").optional().trim().isLength({ max: 5000 }).withMessage("Review is too long"),
  ...categoryRatings.map((field) => body(field).optional()
    .isInt({ min: 1, max: 5 }).withMessage(`${field} must be between 1 and 5`).toInt()),
  body("wouldRecommend").optional().isBoolean().withMessage("wouldRecommend must be a boolean").toBoolean(),
  ...clientControlledForbidden.map((field) => body(field).not().exists()
    .withMessage(`${field} is server controlled`)),
];

const feedbackIdValidator = [param("id").isMongoId().withMessage("Invalid feedback ID")];
const feedbackStatusValidator = [
  ...feedbackIdValidator,
  body("status").isIn(Object.values(FEEDBACK_STATUS)).withMessage("Invalid feedback status"),
];
const feedbackUpdateValidator = [
  ...feedbackIdValidator,
  body("adminNotes").optional().isString().isLength({ max: 5000 }).withMessage("Admin notes are too long"),
];
const feedbackListValidator = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1 }).toInt().customSanitizer((value) => Math.min(value, 100)),
  query("agent").optional().isMongoId().withMessage("Invalid Agent ID"),
  query("property").optional().isMongoId().withMessage("Invalid Property ID"),
  query("rating").optional().isInt({ min: 1, max: 5 }).toInt(),
  query("status").optional().isIn(Object.values(FEEDBACK_STATUS)).withMessage("Invalid feedback status"),
  query("dateFrom").optional().isISO8601().withMessage("Invalid start date"),
  query("dateTo").optional().isISO8601().withMessage("Invalid end date"),
  query("sortBy").optional().isIn(["createdAt", "updatedAt", "rating", "status", "feedbackNumber"])
    .withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Invalid sort order"),
];

module.exports = {
  feedbackSubmissionValidator,
  feedbackIdValidator,
  feedbackStatusValidator,
  feedbackUpdateValidator,
  feedbackListValidator,
};
