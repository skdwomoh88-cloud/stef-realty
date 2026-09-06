const express = require("express");
const router = express.Router();

const ROLES = require("../constants/roles");

const {
  createTask,
  getAllTasks,
  getMyTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  updateTaskAssignment,
  deleteTask,
} = require("../controllers/taskController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

const taskValidator = require("../validators/taskValidator");
const validate = require("../middleware/validationMiddleware");
const updateTaskValidator = require("../validators/updateTaskValidator");
const updateTaskStatusValidator = require("../validators/updateTaskStatusValidator");
const updateTaskAssignmentValidator = require("../validators/updateTaskAssignmentValidator");
const { taskQueryValidator } = require("../validators/queryValidator");

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  taskQueryValidator,
  validate,
  getAllTasks
);

router.get(
  "/my",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  taskQueryValidator,
  validate,
  getMyTasks
);

router.get(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getTaskById
);

router.put(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updateTaskValidator,
  validate,
  updateTask
);

router.put(
  "/:id/status",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updateTaskStatusValidator,
  validate,
  updateTaskStatus
);

router.put(
  "/:id/assign",
  protect,
  authorize(ROLES.ADMIN),
  updateTaskAssignmentValidator,
  validate,
  updateTaskAssignment
);

router.delete(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  deleteTask
);

router.post(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  taskValidator,
  validate,
  createTask
);

module.exports = router;
