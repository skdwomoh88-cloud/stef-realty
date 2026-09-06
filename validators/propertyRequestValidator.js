const { body, param, query } = require("express-validator");
const PROPERTY_REQUEST_STATUS = require("../constants/propertyRequestStatus");
const PRIORITIES = require("../constants/priorities");
const PROPERTY_TYPES = require("../constants/propertyTypes");

const protectedFields = ["requestNumber", "status", "priority", "assignedAgent", "assignedBy", "assignedAt", "internalNotes", "nextFollowUpAt"];
const publicCreate = [
  body().custom((value) => {
    const injected = protectedFields.find((field) => Object.prototype.hasOwnProperty.call(value, field));
    if (injected) throw new Error(`${injected} cannot be set on a public property request`);
    if (value.minBudget != null && value.maxBudget != null && Number(value.minBudget) > Number(value.maxBudget)) {
      throw new Error("Minimum budget cannot exceed maximum budget");
    }
    return true;
  }),
  body("fullName").trim().isLength({ min: 2, max: 120 }).withMessage("Invalid full name"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("phone").trim().isLength({ min: 7, max: 30 }).withMessage("Invalid phone"),
  body("preferredContactMethod").isIn(["Email", "Phone", "WhatsApp"]).withMessage("Invalid contact method"),
  body("listingType").isIn(["Sale", "Rent"]).withMessage("Invalid listing type"),
  body("category").isIn(["Residential", "Commercial"]).withMessage("Invalid category"),
  body("propertyType").isIn(PROPERTY_TYPES).withMessage("Invalid property type"),
  body("preferredRegion").optional().trim().isLength({ max: 100 }).withMessage("Region is too long"),
  body("preferredCity").optional().trim().isLength({ max: 100 }).withMessage("City is too long"),
  body("preferredArea").optional().trim().isLength({ max: 100 }).withMessage("Area is too long"),
  body("minBudget").optional({ nullable: true }).isFloat({ min: 0 }).toFloat().withMessage("Invalid minimum budget"),
  body("maxBudget").optional({ nullable: true }).isFloat({ min: 0 }).toFloat().withMessage("Invalid maximum budget"),
  body("currency").trim().matches(/^[A-Za-z]{3}$/).customSanitizer((value) => value.toUpperCase()).withMessage("Currency must be a three-letter code"),
  body("bedrooms").optional({ nullable: true }).isInt({ min: 0 }).toInt().withMessage("Invalid bedrooms"),
  body("bathrooms").optional({ nullable: true }).isInt({ min: 0 }).toInt().withMessage("Invalid bathrooms"),
  body("timeframe").optional().trim().isLength({ max: 120 }).withMessage("Timeframe is too long"),
  body("requirements").optional().trim().isLength({ max: 5000 }).withMessage("Requirements are too long"),
];

const id = [param("id").isMongoId().withMessage("Invalid property request ID")];
const assign = [...id, body("assignedAgent").isMongoId().withMessage("Invalid assigned Agent ID")];
const update = [
  ...id,
  body("status").optional().isIn(Object.values(PROPERTY_REQUEST_STATUS)).withMessage("Invalid status"),
  body("priority").optional().isIn(Object.values(PRIORITIES)).withMessage("Invalid priority"),
  body("internalNotes").optional().isString().isLength({ max: 5000 }).withMessage("Internal notes are too long"),
  body("nextFollowUpAt").optional({ nullable: true }).isISO8601().withMessage("Invalid follow-up date"),
];
const list = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("status").optional().isIn(Object.values(PROPERTY_REQUEST_STATUS)).withMessage("Invalid status"),
  query("priority").optional().isIn(Object.values(PRIORITIES)).withMessage("Invalid priority"),
  query("assignedAgent").optional().isMongoId().withMessage("Invalid assigned Agent ID"),
  query("listingType").optional().isIn(["Sale", "Rent"]).withMessage("Invalid listing type"),
  query("category").optional().isIn(["Residential", "Commercial"]).withMessage("Invalid category"),
  query("propertyType").optional().isIn(PROPERTY_TYPES).withMessage("Invalid property type"),
  query("preferredRegion").optional().trim().isLength({ min: 1, max: 100 }).withMessage("Invalid region"),
  query("preferredCity").optional().trim().isLength({ min: 1, max: 100 }).withMessage("Invalid city"),
  query("preferredArea").optional().trim().isLength({ min: 1, max: 100 }).withMessage("Invalid area"),
  query("sortBy").optional().isIn(["createdAt", "updatedAt", "requestNumber", "status", "priority", "nextFollowUpAt"]).withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Invalid sort order"),
  query("dateFrom").optional().isISO8601().withMessage("Invalid start date"),
  query("dateTo").optional().isISO8601().withMessage("Invalid end date"),
];

module.exports = { publicCreate, id, assign, update, list };
