const { body } = require("express-validator");
const TASK_STATUS = require("../constants/taskStatus");

const updateTaskStatusValidator = [
  body("status")
    .notEmpty()
    .withMessage("Status is required")
    .isIn(Object.values(TASK_STATUS))
    .withMessage("Invalid task status"),
];

module.exports = updateTaskStatusValidator;