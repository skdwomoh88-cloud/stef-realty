const { body } = require("express-validator");

const validateDeal = [
  body("offer")
    .isMongoId()
    .withMessage("Invalid offer ID"),

  body("salePrice")
    .isFloat({ gt: 0 })
    .withMessage("Sale price must be greater than zero"),

  body("termsOfPayment")
    .trim()
    .notEmpty()
    .withMessage("Terms of payment is required"),
];

module.exports = validateDeal;