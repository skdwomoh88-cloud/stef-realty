const { body } = require("express-validator");
const PROPERTY_TYPES = require("../constants/propertyTypes");

const protectedFields = ["status", "approvedProperty", "reviewedBy", "approvedBy", "reviewedAt", "approvedAt", "internalNotes", "images", "submissionReference"];

module.exports = [
  body().custom((value) => {
    const injected = protectedFields.find((field) => Object.prototype.hasOwnProperty.call(value, field));
    if (injected) throw new Error(`${injected} cannot be set on a public submission`);
    return true;
  }),
  body("ownerName").trim().isLength({ min: 2, max: 120 }).withMessage("Owner name must be between 2 and 120 characters"),
  body("phone").trim().isLength({ min: 7, max: 30 }).withMessage("Phone must be between 7 and 30 characters"),
  body("email").optional({ checkFalsy: true }).isEmail().normalizeEmail().withMessage("Invalid email"),
  body("title").trim().isLength({ min: 3, max: 200 }).withMessage("Title must be between 3 and 200 characters"),
  body("description").optional().isString().isLength({ max: 5000 }).withMessage("Description must not exceed 5000 characters"),
  body("askingPrice").isFloat({ gt: 0 }).toFloat().withMessage("Asking price must be greater than zero"),
  body("listingType").isIn(["Sale", "Rent"]).withMessage("Invalid listing type"),
  body("category").isIn(["Residential", "Commercial"]).withMessage("Invalid category"),
  body("propertyType").isIn(PROPERTY_TYPES).withMessage("Invalid property type"),
  body("locationNotListed").optional().isBoolean().withMessage("locationNotListed must be a boolean").toBoolean(),
  body("region").if((value, { req }) => req.body.locationNotListed !== true).trim().isLength({ min: 1, max: 100 }).withMessage("Region is required"),
  body("city").if((value, { req }) => req.body.locationNotListed !== true).trim().isLength({ min: 1, max: 100 }).withMessage("City is required"),
  body("area").if((value, { req }) => req.body.locationNotListed !== true).trim().isLength({ min: 1, max: 100 }).withMessage("Area is required"),
  body("exactLocation")
    .isString().withMessage("Exact property location is required")
    .trim()
    .notEmpty().withMessage("Exact property location is required")
    .isLength({ max: 500 }).withMessage("Exact property location must not exceed 500 characters"),
];
