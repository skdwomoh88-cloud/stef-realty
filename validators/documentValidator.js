const { body, param, query } = require("express-validator");
const DOCUMENT_CATEGORIES = require("../constants/documentCategories");

const relationshipFields = [
  "relatedProperty", "relatedInquiry", "relatedViewingRequest", "relatedOffer",
  "relatedDeal", "relatedTask", "relatedCase", "relatedInspection",
  "relatedListingDraft",
];
const protectedFields = [
  "documentNumber", "storedFileName", "uploadedBy", "mimeType", "fileSize",
  "originalFileName",
];

const documentCreateValidator = [
  body("title").trim().notEmpty().withMessage("Title is required").isLength({ max: 200 }),
  body("description").optional().trim().isLength({ max: 5000 }).withMessage("Description is too long"),
  body("category").isIn(Object.values(DOCUMENT_CATEGORIES)).withMessage("Invalid document category"),
  ...relationshipFields.map((field) =>
    body(field).optional({ values: "null" }).isMongoId().withMessage(`Invalid ${field} ID`)
  ),
  ...protectedFields.map((field) =>
    body(field).not().exists().withMessage(`${field} cannot be supplied by the client`)
  ),
];

const documentUpdateValidator = [
  body("title").optional().trim().notEmpty().withMessage("Title cannot be empty").isLength({ max: 200 }),
  body("description").optional().trim().isLength({ max: 5000 }).withMessage("Description is too long"),
  body("category").optional().isIn(Object.values(DOCUMENT_CATEGORIES)).withMessage("Invalid document category"),
  ...relationshipFields.map((field) =>
    body(field).not().exists().withMessage(`${field} cannot be changed through metadata update`)
  ),
  ...protectedFields.map((field) =>
    body(field).not().exists().withMessage(`${field} cannot be changed`)
  ),
  body("isArchived").not().exists().withMessage("Use the archive endpoint to archive a document"),
];

const documentIdValidator = [
  param("id").isMongoId().withMessage("Invalid document ID"),
];

const documentListValidator = [
  query("page").optional().isInt({ min: 1 }).withMessage("Page must be at least 1").toInt(),
  query("limit").optional().isInt({ min: 1 }).withMessage("Limit must be at least 1").toInt()
    .customSanitizer((value) => Math.min(value, 100)),
  query("category").optional().isIn(Object.values(DOCUMENT_CATEGORIES)).withMessage("Invalid document category"),
  query("uploadedBy").optional().isMongoId().withMessage("Invalid uploadedBy ID"),
  query("relatedProperty").optional().isMongoId().withMessage("Invalid property ID"),
  query("relatedDeal").optional().isMongoId().withMessage("Invalid deal ID"),
  query("relatedTask").optional().isMongoId().withMessage("Invalid task ID"),
  query("isArchived").optional().isBoolean().withMessage("isArchived must be a boolean").toBoolean(),
  query("sortBy").optional().isIn(["createdAt", "updatedAt", "title", "category", "documentNumber"])
    .withMessage("Invalid sort field"),
  query("sortOrder").optional().isIn(["asc", "desc"]).withMessage("Invalid sort order"),
];

module.exports = {
  documentCreateValidator,
  documentUpdateValidator,
  documentIdValidator,
  documentListValidator,
};
