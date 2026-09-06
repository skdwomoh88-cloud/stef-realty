const { body } = require("express-validator");

module.exports = [
  body("viewingFee").optional({ nullable: true }).isFloat({ min: 0 }).toFloat().withMessage("Viewing fee cannot be negative"),
  body("viewingFeeCurrency").optional({ nullable: true }).custom((value) => {
    if (value === null || /^[A-Za-z]{3}$/.test(value)) return true;
    throw new Error("Viewing fee currency must be a three-letter currency code");
  }).customSanitizer((value) => typeof value === "string" ? value.toUpperCase() : value),
];
