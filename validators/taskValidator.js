const { body } = require("express-validator");
const TASK_STATUS = require("../constants/taskStatus");
const TASK_PRIORITY = require("../constants/taskPriority");

const taskValidator = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required"),

  body("assignedAgent")
    .isMongoId()
    .withMessage("Invalid assigned agent"),

  body("dueDate")
    .isISO8601()
    .withMessage("Invalid due date"),

  body("priority")
    .optional()
    .isIn(Object.values(TASK_PRIORITY))
    .withMessage("Invalid task priority"),

  body("status")
    .optional()
    .isIn(Object.values(TASK_STATUS))
    .withMessage("Invalid task status"),

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
];

module.exports = taskValidator;