const { body } = require("express-validator");
const OFFER_STATUS = require("../constants/offerStatus");

const updateOfferValidator = [
  body("offerAmount")
    .optional()
    .isFloat({ gt: 0 })
    .withMessage("Offer amount must be greater than zero"),

  body("termsOfPayment")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Terms of payment is required"),

  body("status")
    .optional()
    .isIn(Object.values(OFFER_STATUS))
    .withMessage("Invalid offer status"),

  body("priority")
    .optional()
    .isIn(["Low", "Medium", "High"])
    .withMessage("Invalid priority"),

  body("proposedCompletionDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid proposed completion date"),

  body("offerExpiryDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid offer expiry date"),

  body("nextFollowUp")
    .optional()
    .isISO8601()
    .withMessage("Invalid follow-up date"),
];

module.exports = updateOfferValidator;