const { body, param } = require("express-validator");

const VIEWING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High"];
const protectedCreateFields = [
  "status", "priority", "assignedAgent", "assignedBy", "assignedAt",
  "internalNotes", "nextFollowUp", "paymentStatus", "paymentReference",
  "amountDue", "currency", "paidAt", "feedbackTokenHash",
];

const createViewingRequestValidator = [
  body().custom((value) => {
    const injected = protectedCreateFields.find((field) => Object.prototype.hasOwnProperty.call(value, field));
    if (injected) throw new Error(`${injected} cannot be set on a public viewing request`);
    const ids = [
      ...(value.property ? [value.property] : []),
      ...(Array.isArray(value.properties) ? value.properties : []),
    ];
    if (ids.length === 0) throw new Error("At least one property is required");
    return true;
  }),
  body("property").optional().isMongoId().withMessage("Invalid property ID"),
  body("properties").optional().isArray({ min: 1 }).withMessage("Properties must be a non-empty array"),
  body("properties.*").isMongoId().withMessage("Invalid property ID"),
  body("fullName").trim().isLength({ min: 2, max: 100 }).withMessage("Full name must be between 2 and 100 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("phone").trim().notEmpty().withMessage("Phone number is required"),
  body("preferredDate").isISO8601().withMessage("Invalid preferred date"),
  body("preferredTime").trim().notEmpty().withMessage("Preferred time is required"),
  body("message").optional().isString().isLength({ max: 2000 }).withMessage("Message must not exceed 2000 characters"),
];

const updateViewingRequestValidator = [
  param("id").isMongoId().withMessage("Invalid viewing request ID"),
  body("preferredDate").optional().isISO8601().withMessage("Invalid preferred date"),
  body("preferredTime").optional().trim().notEmpty().withMessage("Preferred time cannot be empty"),
  body("message").optional().isString().withMessage("Message must be text"),
  body("priority").optional().isIn(PRIORITIES).withMessage("Invalid priority"),
  body("nextFollowUp").optional({ nullable: true }).isISO8601().withMessage("Invalid follow-up date"),
  body("internalNotes").optional().isString().withMessage("Internal notes must be text"),
  body("status").optional().isIn(VIEWING_STATUSES).withMessage("Invalid viewing status"),
  body("assignedAgent").optional({ nullable: true }).isMongoId().withMessage("Invalid assigned agent"),
];

const updateViewingStatusValidator = [
  param("id").isMongoId().withMessage("Invalid viewing request ID"),
  body("status").isIn(VIEWING_STATUSES).withMessage("Invalid viewing status"),
];

module.exports = {
  createViewingRequestValidator,
  updateViewingRequestValidator,
  updateViewingStatusValidator,
};
