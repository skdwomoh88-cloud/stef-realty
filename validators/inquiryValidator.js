const { body, param } = require("express-validator");
const INQUIRY_STATUS = require("../constants/inquiryStatus");

const createInquiryValidator = [
  body("property").isMongoId().withMessage("Invalid property ID"),
  body("name").trim().isLength({ min: 2, max: 100 }).withMessage("Name must be between 2 and 100 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("phone").trim().notEmpty().withMessage("Phone number is required"),
  body("message").optional().isString().isLength({ max: 2000 }).withMessage("Message must not exceed 2000 characters"),
  body("preferredContactMethod").optional().isIn(["Phone", "Email", "WhatsApp"]).withMessage("Invalid preferred contact method"),
];

const updateInquiryStatusValidator = [
  param("id").isMongoId().withMessage("Invalid inquiry ID"),
  body("status").isIn(Object.values(INQUIRY_STATUS)).withMessage("Invalid inquiry status"),
];

const assignInquiryValidator = [
  param("id").isMongoId().withMessage("Invalid inquiry ID"),
  body("assignedAgent").isMongoId().withMessage("Invalid assigned agent"),
];

module.exports = {
  createInquiryValidator,
  updateInquiryStatusValidator,
  assignInquiryValidator,
};
