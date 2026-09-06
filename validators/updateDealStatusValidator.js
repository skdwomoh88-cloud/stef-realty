const { body } = require("express-validator");
const DEAL_STATUS = require("../constants/dealStatus");

const updateDealStatusValidator = [
  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(Object.values(DEAL_STATUS))
    .withMessage("Invalid deal status"),
];

module.exports = updateDealStatusValidator;