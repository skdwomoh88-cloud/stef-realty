const { body } = require("express-validator");
const TASK_PRIORITY = require("../constants/taskPriority");

const updateTaskValidator = [
  body("title")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Title cannot be empty"),

  body("description")
    .optional()
    .isString()
    .withMessage("Description must be text"),

  body("assignedAgent")
    .optional()
    .isMongoId()
    .withMessage("Invalid assigned agent"),

  body("dueDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid due date"),

  body("priority")
    .optional()
    .isIn(Object.values(TASK_PRIORITY))
    .withMessage("Invalid task priority"),

  body("relatedProperty")
    .optional()
    .isMongoId()
    .withMessage("Invalid property ID"),

  body("relatedInquiry")
    .optional()
    .isMongoId()
    .withMessage("Invalid inquiry ID"),

  body("relatedViewingRequest")
    .optional()
    .isMongoId()
    .withMessage("Invalid viewing request ID"),

  body("relatedOffer")
    .optional()
    .isMongoId()
    .withMessage("Invalid offer ID"),

  body("relatedDeal")
    .optional()
    .isMongoId()
    .withMessage("Invalid deal ID"),

  body("internalNotes")
    .optional()
    .isString()
    .withMessage("Internal notes must be text"),
];

module.exports = updateTaskValidator;