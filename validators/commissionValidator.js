const { body } = require("express-validator");

const commissionValidator = [
  body("amount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Commission amount cannot be negative"),

  body("percentage")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Commission percentage must be between 0 and 100"),

  body("status")
    .optional()
    .isIn(["Pending", "Paid"])
    .withMessage("Invalid commission status"),

  body("paidDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid paid date"),

  body("notes")
    .optional()
    .isString()
    .withMessage("Notes must be text"),
];

module.exports = commissionValidator;