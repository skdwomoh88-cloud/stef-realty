const { body, param } = require("express-validator");

const NOTIFICATION_TYPES = [
  "Property", "Inquiry", "Viewing Request", "Offer",
  "Deal", "Task", "Feedback", "System",
];

const createNotificationValidator = [
  body("title").trim().notEmpty().withMessage("Title is required"),
  body("message").trim().notEmpty().withMessage("Message is required"),
  body("type").isIn(NOTIFICATION_TYPES).withMessage("Invalid notification type"),
  body("recipient").isMongoId().withMessage("Invalid recipient"),
  body("relatedProperty").optional({ nullable: true }).isMongoId().withMessage("Invalid property ID"),
  body("relatedInquiry").optional({ nullable: true }).isMongoId().withMessage("Invalid inquiry ID"),
  body("relatedViewingRequest").optional({ nullable: true }).isMongoId().withMessage("Invalid viewing request ID"),
  body("relatedOffer").optional({ nullable: true }).isMongoId().withMessage("Invalid offer ID"),
  body("relatedDeal").optional({ nullable: true }).isMongoId().withMessage("Invalid deal ID"),
  body("relatedTask").optional({ nullable: true }).isMongoId().withMessage("Invalid task ID"),
];

const notificationIdValidator = [
  param("id").isMongoId().withMessage("Invalid notification ID"),
];

module.exports = {
  createNotificationValidator,
  notificationIdValidator,
};
