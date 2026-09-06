const asyncHandler = require("../utils/asyncHandler");
const caseService = require("../services/caseService");

const createCase = asyncHandler(async (req, res) => {
  const newCase = await caseService.createCase({
    owner: req.body.owner,
    property: req.body.property,
    createdBy: req.user,
    assignedAgent: req.body.assignedAgent,
    priority: req.body.priority,
    source: req.body.source,
    notes: req.body.notes,
  });

  res.status(201).json({
    success: true,
    data: newCase,
  });
});

const getCase = asyncHandler(async (req, res) => {
  const caseData = await caseService.getCase(
    req.params.id,
    req.user
  );

  res.json({
    success: true,
    data: caseData,
  });
});

const assignAgent = asyncHandler(async (req, res) => {
  const updatedCase = await caseService.assignAgent(
    req.params.id,
    req.body.agentId,
    req.user._id
  );

  res.json({
    success: true,
    data: updatedCase,
  });
});

const listCases = asyncHandler(async (req, res) => {
  const result = await caseService.listCases(req.query, req.user);
  res.status(200).json({ success: true, count: result.cases.length, data: result.cases, pagination: result.pagination });
});

module.exports = {
  createCase,
  getCase,
  assignAgent,
  listCases,
};
