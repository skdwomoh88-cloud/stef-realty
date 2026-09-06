const { body, param } = require("express-validator");

const optionalLocationFields = [
  body("country").optional().trim().notEmpty().withMessage("Country cannot be empty"),
  body("district").optional().isString().withMessage("District must be text"),
  body("municipality").optional().isString().withMessage("Municipality must be text"),
  body("postalCode").optional().isString().withMessage("Postal code must be text"),
  body("latitude").optional({ nullable: true }).isFloat({ min: -90, max: 90 }).withMessage("Latitude must be between -90 and 90"),
  body("longitude").optional({ nullable: true }).isFloat({ min: -180, max: 180 }).withMessage("Longitude must be between -180 and 180"),
  body("active").optional().isBoolean().withMessage("Active must be a boolean").toBoolean(),
];

const createLocationValidator = [
  body("region").trim().notEmpty().withMessage("Region is required"),
  body("city").trim().notEmpty().withMessage("City is required"),
  body("area").trim().notEmpty().withMessage("Area is required"),
  ...optionalLocationFields,
];

const updateLocationValidator = [
  param("id").isMongoId().withMessage("Invalid location ID"),
  body("region").optional().trim().notEmpty().withMessage("Region cannot be empty"),
  body("city").optional().trim().notEmpty().withMessage("City cannot be empty"),
  body("area").optional().trim().notEmpty().withMessage("Area cannot be empty"),
  ...optionalLocationFields,
];

module.exports = {
  createLocationValidator,
  updateLocationValidator,
};
