const { body, param, query } = require("express-validator");

const statuses = ["Pending Review", "Inspection Scheduled", "Inspection Completed", "Documents Under Review", "Approved", "Rejected"];
const id = [param("id").isMongoId().withMessage("Invalid Property Submission ID")];

module.exports = {
  id,
  list: [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    query("status").optional().isIn(statuses),
    query("assignedManager").optional().isMongoId(),
    query("assignedAgent").optional().isMongoId(),
    query("incoming").optional().isBoolean(),
    query("search").optional().trim().isLength({ min: 1, max: 120 }),
  ],
  assignees: [query("kind").isIn(["manager", "agent"]).withMessage("Invalid assignee kind")],
  assignManager: [...id, body("assignedManager").isMongoId().withMessage("A valid Manager ID is required")],
  assignAgent: [...id, body("assignedAgent").isMongoId().withMessage("A valid Agent ID is required")],
  workflow: [
    ...id,
    body("status").optional().isIn(statuses).withMessage("Invalid workflow status"),
    body("internalNotes").optional().isString().trim().isLength({ max: 5000 }),
    body("note").optional().isString().trim().isLength({ max: 1000 }),
    body().custom((value) => {
      const allowed = new Set(["status", "internalNotes", "note"]);
      if (Object.keys(value || {}).some((key) => !allowed.has(key))) throw new Error("Only workflow fields may be updated");
      if (!Object.keys(value || {}).some((key) => allowed.has(key))) throw new Error("At least one workflow field is required");
      return true;
    }),
  ],
};
