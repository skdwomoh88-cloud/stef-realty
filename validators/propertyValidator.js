const { body, param } = require("express-validator");
const PROPERTY_STATUS = require("../constants/propertyStatus");
const PROPERTY_VERIFICATION_STATUS = require("../constants/propertyVerificationStatus");
const PROPERTY_TYPES = require("../constants/propertyTypes");

const optionalPropertyFields = [
  body("description").optional().isString().withMessage("Description must be text"),
  body("currency").optional().isString().withMessage("Currency must be text"),
  body("bedrooms").optional().isInt({ min: 0 }).withMessage("Bedrooms cannot be negative"),
  body("bathrooms").optional().isInt({ min: 0 }).withMessage("Bathrooms cannot be negative"),
  body("parkingSpaces").optional().isInt({ min: 0 }).withMessage("Parking spaces cannot be negative"),
  body("areaSize").optional().isFloat({ min: 0 }).withMessage("Area size cannot be negative"),
  body("furnished").optional().isBoolean().withMessage("Furnished must be a boolean"),
  body("featured").optional().isBoolean().withMessage("Featured must be a boolean"),
  body("negotiable").optional().isBoolean().withMessage("Negotiable must be a boolean"),
  body("isArchived").optional().isBoolean().withMessage("isArchived must be a boolean"),
  body("status").optional().isIn(Object.values(PROPERTY_STATUS)).withMessage("Invalid property status"),
  body("verificationStatus").optional().isIn(Object.values(PROPERTY_VERIFICATION_STATUS)).withMessage("Invalid verification status"),
  body("owner").optional({ nullable: true }).isMongoId().withMessage("Invalid owner ID"),
  body("assignedAgent").optional({ nullable: true }).isMongoId().withMessage("Invalid assigned agent ID"),
  body("images").optional().isArray().withMessage("Images must be an array"),
  body("images.*.url").optional().isString().notEmpty().withMessage("Image URL is required"),
];

const validateProperty = [
  body("title").trim().notEmpty().withMessage("Title is required"),
  body("price").isFloat({ gt: 0 }).withMessage("Price must be greater than zero"),
  body("listingType").isIn(["Sale", "Rent"]).withMessage("Listing type must be Sale or Rent"),
  body("category").isIn(["Residential", "Commercial"]).withMessage("Category must be Residential or Commercial"),
  body("propertyType").isIn(PROPERTY_TYPES).withMessage("Invalid property type"),
  body("location").isMongoId().withMessage("Invalid location ID"),
  ...optionalPropertyFields,
];

const updatePropertyValidator = [
  param("id").isMongoId().withMessage("Invalid property ID"),
  body("title").optional().trim().notEmpty().withMessage("Title cannot be empty"),
  body("price").optional().isFloat({ gt: 0 }).withMessage("Price must be greater than zero"),
  body("listingType").optional().isIn(["Sale", "Rent"]).withMessage("Invalid listing type"),
  body("category").optional().isIn(["Residential", "Commercial"]).withMessage("Invalid category"),
  body("propertyType").optional().isIn(PROPERTY_TYPES).withMessage("Invalid property type"),
  body("location").optional().isMongoId().withMessage("Invalid location ID"),
  ...optionalPropertyFields,
];

module.exports = {
  validateProperty,
  updatePropertyValidator,
  PROPERTY_TYPES,
};
