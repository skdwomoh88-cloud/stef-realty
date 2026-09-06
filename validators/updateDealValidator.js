const { body } = require("express-validator");

const updateDealValidator = [
  body("salePrice")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("Sale price must be greater than zero"),

  body("termsOfPayment")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Terms of payment is required"),

  body("nextFollowUp")
    .optional()
    .isISO8601()
    .withMessage("Invalid follow-up date"),

  body("internalNotes")
    .optional()
    .isString()
    .withMessage("Internal notes must be text"),
];

module.exports = updateDealValidator;