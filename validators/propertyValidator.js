const { body } = require("express-validator");

const validateProperty = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("Title is required"),

  body("price")
    .isNumeric()
    .withMessage("Price must be a number"),

  body("listingType")
    .isIn(["Sale", "Rent"])
    .withMessage("Listing type must be Sale or Rent"),

  body("category")
    .isIn(["Residential", "Commercial"])
    .withMessage("Category must be Residential or Commercial"),

  body("propertyType")
    .notEmpty()
    .withMessage("Property type is required"),

  body("location")
  .notEmpty()
  .withMessage("Location is required")
  .isMongoId()
  .withMessage("Invalid location ID"),
];

module.exports = validateProperty;