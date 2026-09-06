const { body } = require("express-validator");
const OFFER_STATUS = require("../constants/offerStatus");

const validateOffer = [
  body("property")
    .isMongoId()
    .withMessage("Invalid property ID"),

  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required"),

  body("email")
    .isEmail()
    .withMessage("Valid email is required"),

  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required"),

  body("offerAmount")
    .isFloat({ gt: 0 })
    .withMessage("Offer amount must be greater than zero"),

  body("termsOfPayment")
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
];

module.exports = validateOffer;