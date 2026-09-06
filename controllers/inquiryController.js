const asyncHandler = require("../utils/asyncHandler");
const inquiryService = require("../services/inquiryService");

const createInquiry = asyncHandler(async (req, res) => {
  const inquiry = await inquiryService.createInquiry(req.body);

  res.status(201).json({
    success: true,
    data: inquiry,
  });
});

const getAllInquiries = asyncHandler(async (req, res) => {
  const inquiries = await inquiryService.getAllInquiries();

  res.json({
    success: true,
    count: inquiries.length,
    data: inquiries,
  });
});

const getMyInquiries = asyncHandler(async (req, res) => {
  const inquiries = await inquiryService.getAgentInquiries(req.user._id);

  res.json({
    success: true,
    count: inquiries.length,
    data: inquiries,
  });
});

const getInquiryById = asyncHandler(async (req, res) => {
  const inquiry = await inquiryService.getInquiryById(
  req.params.id,
  req.user
);

  res.json({
    success: true,
    data: inquiry,
  });
});

const updateInquiryStatus = asyncHandler(async (req, res) => {
  const inquiry = await inquiryService.updateInquiryStatus(
  req.params.id,
  req.body.status,
  req.user
);

  res.json({
    success: true,
    data: inquiry,
  });
});

const assignAgent = asyncHandler(async (req, res) => {
  const inquiry = await inquiryService.assignAgent(
    req.params.id,
    req.body.assignedAgent,
    req.user._id
  );

  res.json({
    success: true,
    data: inquiry,
  });
});

module.exports = {
  createInquiry,
  getAllInquiries,
  getMyInquiries,
  getInquiryById,
  updateInquiryStatus,
  assignAgent,
};
