const { query } = require("express-validator");
const TASK_STATUS = require("../constants/taskStatus");
const TASK_PRIORITY = require("../constants/taskPriority");
const PROPERTY_TYPES = require("../constants/propertyTypes");

const paginationValidators = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be at least 1").toInt(),
  query("limit").optional().isInt({ min: 1 }).withMessage("Limit must be at least 1").toInt().customSanitizer((value) => Math.min(value, 100)),
];

const taskQueryValidator = [
  ...paginationValidators,
  query("status").optional().isIn(Object.values(TASK_STATUS)).withMessage("Invalid task status"),
  query("priority").optional().isIn(Object.values(TASK_PRIORITY)).withMessage("Invalid task priority"),
  query("assignedAgent").optional().isMongoId().withMessage("Invalid assigned agent"),
  query("sortBy").optional().isIn(["createdAt", "updatedAt", "dueDate", "priority", "status", "title"]).withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Invalid sort order"),
];

const propertyQueryValidator = [
  ...paginationValidators,
  query("maxPrice").optional().isFloat({ gt: 0 }).withMessage("Maximum price must be greater than zero").toFloat(),
  query("minPrice").optional().isFloat({ min: 0 }).withMessage("Minimum price cannot be negative").toFloat(),
  query("featured").optional().isBoolean().withMessage("Featured must be a boolean"),
  query("listingType").optional().isIn(["Sale", "Rent"]).withMessage("Invalid listing type"),
  query("category").optional().isIn(["Residential", "Commercial"]).withMessage("Invalid category"),
  query("propertyType").optional().isIn(PROPERTY_TYPES).withMessage("Invalid property type"),
  query("location").optional().isMongoId().withMessage("Invalid location ID"),
  query("region").optional().trim().isLength({ min: 1, max: 100 }).withMessage("Invalid region"),
  query("city").optional().trim().isLength({ min: 1, max: 100 }).withMessage("Invalid city"),
  query("area").optional().trim().isLength({ min: 1, max: 100 }).withMessage("Invalid area"),
  query("sort").optional().isIn(["oldest", "price-low", "price-high"]).withMessage("Invalid sort option"),
];

const searchQueryValidator = [
  query("q").optional().trim().isLength({ max: 100 }).withMessage("Search query must not exceed 100 characters"),
];

module.exports = {
  taskQueryValidator,
  propertyQueryValidator,
  searchQueryValidator,
};
