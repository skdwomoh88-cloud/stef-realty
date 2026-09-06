const asyncHandler = require("../utils/asyncHandler");
const inspectionService = require("../services/inspectionService");

const scheduleInspection = asyncHandler(async (req, res) => {
  const inspection = await inspectionService.scheduleInspection({
    caseId: req.body.caseId,
    property: req.body.property,
    agent: req.body.agent,
    scheduledDate: req.body.scheduledDate,
    notes: req.body.notes,
    currentUser: req.user,
  });

  res.status(201).json({
    success: true,
    data: inspection,
  });
});

const completeInspection = asyncHandler(async (req, res) => {
  const inspection =
    await inspectionService.completeInspection(
      req.params.id,
      req.body.notes,
      req.user
    );

  res.json({
    success: true,
    data: inspection,
  });
});

const listInspections = asyncHandler(async (req, res) => {
  const result = await inspectionService.listInspections(req.query, req.user);
  res.status(200).json({ success: true, count: result.inspections.length, data: result.inspections, pagination: result.pagination });
});

module.exports = {
  scheduleInspection,
  completeInspection,
  listInspections,
};
