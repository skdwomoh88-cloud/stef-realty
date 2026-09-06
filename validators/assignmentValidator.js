const { body, param } = require("express-validator");

const offerAssignmentValidator = [
  param("id").isMongoId().withMessage("Invalid offer ID"),
  body("assignedAgent").isMongoId().withMessage("Invalid assigned agent"),
];

const caseAssignmentValidator = [
  param("id").isMongoId().withMessage("Invalid case ID"),
  body("agentId").isMongoId().withMessage("Invalid assigned agent"),
];

const inspectionScheduleValidator = [
  body("caseId").isMongoId().withMessage("Invalid case ID"),
  body("property").isMongoId().withMessage("Invalid property ID"),
  body("agent").isMongoId().withMessage("Invalid assigned agent"),
  body("scheduledDate").isISO8601().withMessage("Invalid scheduled date"),
];

module.exports = {
  offerAssignmentValidator,
  caseAssignmentValidator,
  inspectionScheduleValidator,
};
