const { param, query } = require("express-validator");

const listEvents = [
  query("page").optional().isInt({ min: 1 }).toInt().withMessage("Page must be at least 1"),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt().withMessage("Limit must be between 1 and 100"),
  query("actor").optional().isMongoId().withMessage("Invalid actor ID"),
  query("entityId").optional().isMongoId().withMessage("Invalid entity ID"),
  query("action").optional().trim().isLength({ min: 1, max: 100 }).matches(/^[A-Z0-9_.:-]+$/).withMessage("Invalid audit action"),
  query("entityType").optional().trim().isLength({ min: 1, max: 100 }).matches(/^[A-Za-z0-9 _.-]+$/).withMessage("Invalid entity type"),
  query("outcome").optional().isIn(["SUCCESS", "FAILURE"]).withMessage("Invalid audit outcome"),
  query("from").optional().isISO8601().toDate().withMessage("Invalid start date"),
  query("to").optional().isISO8601().toDate().withMessage("Invalid end date"),
  query("sort").optional().isIn(["asc", "desc"]).withMessage("Sort must be asc or desc"),
];

const eventId = [param("id").isMongoId().withMessage("Invalid audit event ID")];

module.exports = { listEvents, eventId };
