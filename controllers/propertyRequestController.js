const asyncHandler = require("express-async-handler");
const service = require("../services/propertyRequestService");

exports.create = asyncHandler(async (req, res) => {
  const request = await service.create(req.body);
  res.status(201).json({ success: true, message: "Property request submitted successfully.", data: request });
});
exports.list = asyncHandler(async (req, res) => {
  const result = await service.list(req.query, req.user);
  res.json({ success: true, data: result.requests, pagination: result.pagination });
});
exports.getById = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.getById(req.params.id, req.user) });
});
exports.assign = asyncHandler(async (req, res) => {
  const request = await service.assign(req.params.id, req.body.assignedAgent, req.user);
  res.json({ success: true, message: "Property request assigned successfully.", data: request });
});
exports.update = asyncHandler(async (req, res) => {
  const request = await service.update(req.params.id, req.body, req.user);
  res.json({ success: true, message: "Property request updated successfully.", data: request });
});
