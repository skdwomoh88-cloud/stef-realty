const asyncHandler = require("../utils/asyncHandler");
const taskService = require("../services/taskService");

const createTask = asyncHandler(async (req, res) => {
  const task = await taskService.createTask(
    req.body,
    req.user
  );

  res.status(201).json({
    success: true,
    message: "Task created successfully.",
    data: task,
  });
});

const getAllTasks = asyncHandler(async (req, res) => {
  const result = await taskService.getAllTasks(req.query);

  res.status(200).json({
    success: true,
    count: result.tasks.length,
    data: result.tasks,
    pagination: result.pagination,
  });
});

const getMyTasks = asyncHandler(async (req, res) => {
  const result = await taskService.getMyTasks(
    req.user._id,
    req.query
  );

  res.status(200).json({
    success: true,
    count: result.tasks.length,
    data: result.tasks,
    pagination: result.pagination,
  });
});

const getTaskById = asyncHandler(async (req, res) => {
  const task = await taskService.getTaskById(
    req.params.id,
    req.user
  );

  res.status(200).json({
    success: true,
    data: task,
  });
});

const updateTask = asyncHandler(async (req, res) => {
  const task = await taskService.updateTask(
    req.params.id,
    req.body,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Task updated successfully.",
    data: task,
  });
});

const updateTaskStatus = asyncHandler(async (req, res) => {
  const task = await taskService.updateTaskStatus(
    req.params.id,
    req.body.status,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Task status updated successfully.",
    data: task,
  });
});

const updateTaskAssignment = asyncHandler(async (req, res) => {
  const task = await taskService.updateTaskAssignment(
    req.params.id,
    req.body.assignedAgent,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Task reassigned successfully.",
    data: task,
  });
});

const deleteTask = asyncHandler(async (req, res) => {
  await taskService.deleteTask(req.params.id);

  res.status(200).json({
    success: true,
    message: "Task deleted successfully.",
  });
});

module.exports = {
  createTask,
  getAllTasks,
  getMyTasks,
  getTaskById,
  updateTask,
  updateTaskStatus,
  updateTaskAssignment,
  deleteTask,
};