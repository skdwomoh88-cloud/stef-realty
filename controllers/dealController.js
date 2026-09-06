const asyncHandler = require("../utils/asyncHandler");
const dealService = require("../services/dealService");

const createDeal = asyncHandler(async (req, res) => {
  const deal = await dealService.createDeal(
    req.body,
    req.user
  );

  res.status(201).json({
    success: true,
    message: "Deal created successfully.",
    data: deal,
  });
});

const getAllDeals = asyncHandler(async (req, res) => {
  const deals = await dealService.getAllDeals();

  res.status(200).json({
    success: true,
    count: deals.length,
    data: deals,
  });
});

const getMyDeals = asyncHandler(async (req, res) => {
  const deals = await dealService.getMyDeals(req.user._id);

  res.status(200).json({
    success: true,
    count: deals.length,
    data: deals,
  });
});

const getDealById = asyncHandler(async (req, res) => {
  const deal = await dealService.getDealById(
    req.params.id,
    req.user
  );

  res.status(200).json({
    success: true,
    data: deal,
  });
});

const updateDeal = asyncHandler(async (req, res) => {
  const deal = await dealService.updateDeal(
    req.params.id,
    req.body,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Deal updated successfully.",
    data: deal,
  });
});

const updateDealStatus = asyncHandler(async (req, res) => {
  const deal = await dealService.updateDealStatus(
    req.params.id,
    req.body.status,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Deal status updated successfully.",
    data: deal,
  });
});

const recordPayment = asyncHandler(async (req, res) => {
  const deal = await dealService.recordPayment(
    req.params.id,
    req.body,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Payment recorded successfully.",
    data: deal,
  });
});

const updateCommission = asyncHandler(async (req, res) => {
  const deal = await dealService.updateCommission(
    req.params.id,
    req.body,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Commission updated successfully.",
    data: deal,
  });
});

const closeDeal = asyncHandler(async (req, res) => {
  const deal = await dealService.closeDeal(
    req.params.id,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Deal closed successfully.",
    data: deal,
  });
});

const deleteDeal = asyncHandler(async (req, res) => {
  await dealService.deleteDeal(req.params.id);

  res.status(200).json({
    success: true,
    message: "Deal deleted successfully.",
  });
});

module.exports = {
  createDeal,
  getAllDeals,
  getMyDeals,
  getDealById,
  updateDeal,
  updateDealStatus,
  recordPayment,
  updateCommission,
  closeDeal,
  deleteDeal,
};