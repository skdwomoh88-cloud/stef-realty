const { query } = require("express-validator");
const PROPERTY_STATUS = require("../constants/propertyStatus");
const PROPERTY_VERIFICATION_STATUS = require("../constants/propertyVerificationStatus");
const CASE_STATUS = require("../constants/caseStatus");
const CASE_PRIORITY = require("../constants/casePriority");
const INSPECTION_STATUS = require("../constants/inspectionStatus");
const LISTING_DRAFT_STATUS = require("../constants/listingDraftStatus");

const pagination = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be at least 1").toInt(),
  query("limit").optional().isInt({ min: 1 }).withMessage("Limit must be at least 1").toInt()
    .customSanitizer((value) => Math.min(value, 100)),
];
const optionalId = (field, label) => query(field).optional().isMongoId()
  .withMessage(`Invalid ${label} ID`);

const propertyManagementQueryValidator = [
  ...pagination,
  query("status").optional().isIn(Object.values(PROPERTY_STATUS)).withMessage("Invalid property status"),
  query("verificationStatus").optional().isIn(Object.values(PROPERTY_VERIFICATION_STATUS)).withMessage("Invalid verification status"),
  query("listingType").optional().isIn(["Sale", "Rent"]).withMessage("Invalid listing type"),
  query("category").optional().isIn(["Residential", "Commercial"]).withMessage("Invalid category"),
  optionalId("location", "location"), optionalId("owner", "owner"), optionalId("assignedAgent", "assigned Agent"),
  query("isArchived").optional().isBoolean().withMessage("isArchived must be a boolean").toBoolean(),
  query("sortBy").optional().isIn(["createdAt", "updatedAt", "title", "price", "status", "verificationStatus"]).withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Invalid sort order"),
];
const caseListQueryValidator = [
  ...pagination,
  query("status").optional().isIn(Object.values(CASE_STATUS)).withMessage("Invalid case status"),
  query("priority").optional().isIn(Object.values(CASE_PRIORITY)).withMessage("Invalid case priority"),
  optionalId("assignedAgent", "assigned Agent"), optionalId("owner", "owner"), optionalId("property", "property"),
  query("sortBy").optional().isIn(["createdAt", "updatedAt", "caseNumber", "status", "priority"]).withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Invalid sort order"),
];
const inspectionListQueryValidator = [
  ...pagination,
  query("status").optional().isIn(Object.values(INSPECTION_STATUS)).withMessage("Invalid inspection status"),
  optionalId("case", "case"), optionalId("property", "property"), optionalId("agent", "Agent"),
  query("dateFrom").optional().isISO8601().withMessage("Invalid start date"),
  query("dateTo").optional().isISO8601().withMessage("Invalid end date"),
  query("sortBy").optional().isIn(["createdAt", "updatedAt", "scheduledDate", "status"]).withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Invalid sort order"),
];
const listingDraftListQueryValidator = [
  ...pagination,
  query("status").optional().isIn(Object.values(LISTING_DRAFT_STATUS)).withMessage("Invalid listing draft status"),
  optionalId("case", "case"), optionalId("property", "property"),
  query("sortBy").optional().isIn(["createdAt", "updatedAt", "headline", "status"]).withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Invalid sort order"),
];

module.exports = { propertyManagementQueryValidator, caseListQueryValidator, inspectionListQueryValidator, listingDraftListQueryValidator };
