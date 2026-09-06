const asyncHandler = require("../utils/asyncHandler");
const offerService = require("../services/offerService");

// Create Offer
const createOffer = asyncHandler(async (req, res) => {
  const offer = await offerService.createOffer(req.body);

  res.status(201).json({
    success: true,
    message: "Offer submitted successfully.",
    data: offer,
  });
});

const getAllOffers = asyncHandler(async (req, res) => {
  const offers = await offerService.getAllOffers();

  res.status(200).json({
    success: true,
    count: offers.length,
    data: offers,
  });
});

const getMyOffers = asyncHandler(async (req, res) => {
  const offers = await offerService.getMyOffers(req.user._id);

  res.status(200).json({
    success: true,
    count: offers.length,
    data: offers,
  });
});

const assignOffer = asyncHandler(async (req, res) => {
  const offer = await offerService.assignOffer(
    req.params.id,
    req.body.assignedAgent,
    req.user._id
  );

  res.status(200).json({
    success: true,
    data: offer,
  });
});

const getOfferById = asyncHandler(async (req, res) => {
  const offer = await offerService.getOfferById(
    req.params.id,
    req.user
  );

  res.status(200).json({
    success: true,
    data: offer,
  });
});

const updateOfferStatus = asyncHandler(async (req, res) => {
  const offer = await offerService.updateOfferStatus(
    req.params.id,
    req.body.status,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Offer status updated successfully.",
    data: offer,
  });
});

const updateOffer = asyncHandler(async (req, res) => {
  const offer = await offerService.updateOffer(
    req.params.id,
    req.body,
    req.user
  );

  res.status(200).json({
    success: true,
    message: "Offer updated successfully.",
    data: offer,
  });
});

const deleteOffer = asyncHandler(async (req, res) => {
  await offerService.deleteOffer(req.params.id);

  res.status(200).json({
    success: true,
    message: "Offer deleted successfully.",
  });
});

module.exports = {
  createOffer,
  getAllOffers,
  getMyOffers,
  assignOffer,
  getOfferById,
  updateOfferStatus,
  updateOffer,
  deleteOffer,
};