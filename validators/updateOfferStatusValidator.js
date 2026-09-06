const { body } = require("express-validator");
const OFFER_STATUS = require("../constants/offerStatus");

const updateOfferStatusValidator = [
  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(Object.values(OFFER_STATUS))
    .withMessage("Invalid offer status"),
];

module.exports = updateOfferStatusValidator;