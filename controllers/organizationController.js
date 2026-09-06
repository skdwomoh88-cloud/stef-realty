const asyncHandler = require("../utils/asyncHandler");
const service = require("../services/organizationService");

exports.listDepartments = asyncHandler(async (req, res) => {
  const departments = await service.listDepartments(req.query);
  res.json({ success: true, count: departments.length, data: departments });
});
exports.getDepartment = asyncHandler(async (req, res) => res.json({ success: true, data: await service.getDepartmentById(req.params.id) }));
exports.createDepartment = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createDepartment(req.body, { actor: req.user, request: req }) }));
exports.updateDepartment = asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateDepartment(req.params.id, req.body, { actor: req.user, request: req }) }));
exports.listEmployees = asyncHandler(async (req, res) => {
  const result = await service.listEmployees(req.query, req.user);
  res.json({ success: true, count: result.employees.length, data: result.employees, pagination: result.pagination });
});
exports.getEmployee = asyncHandler(async (req, res) => res.json({ success: true, data: await service.getEmployeeById(req.params.id, req.user) }));
exports.createEmployee = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createEmployee(req.body, { actor: req.user, request: req }) }));
exports.updateEmployee = asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateEmployee(req.params.id, req.body, { actor: req.user, request: req }) }));
