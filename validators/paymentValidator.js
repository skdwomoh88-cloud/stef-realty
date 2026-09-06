const { body } = require("express-validator");

const paymentValidator = [
  body("amount")
    .isFloat({ gt: 0 })
    .withMessage("Payment amount must be greater than zero"),

  body("paymentDate")
    .isISO8601()
    .withMessage("Invalid payment date"),

  body("paymentMethod")
    .trim()
    .notEmpty()
    .withMessage("Payment method is required"),

  body("referenceNumber")
    .optional()
    .isString()
    .withMessage("Reference number must be text"),

  body("notes")
    .optional()
    .isString()
    .withMessage("Notes must be text"),
];

module.exports = paymentValidator;