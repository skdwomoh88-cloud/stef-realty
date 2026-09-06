const { body } = require("express-validator");

const updateTaskAssignmentValidator = [
  body("assignedAgent")
    .notEmpty()
    .withMessage("Assigned agent is required")
    .isMongoId()
    .withMessage("Invalid assigned agent"),
];

module.exports = updateTaskAssignmentValidator;