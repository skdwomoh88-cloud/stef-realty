const asyncHandler = require("../utils/asyncHandler");
const auditService = require("../services/auditService");

exports.listEvents = asyncHandler(async (req, res) => {
  const result = await auditService.listAuditEvents(req.query);
  res.json({ success: true, count: result.events.length, data: result.events, pagination: result.pagination });
});

exports.getEvent = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await auditService.getAuditEventById(req.params.id) });
});
