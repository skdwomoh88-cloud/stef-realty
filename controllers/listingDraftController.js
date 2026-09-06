const asyncHandler = require("../utils/asyncHandler");
const listingDraftService = require("../services/listingDraftService");
const ListingDraft = require("../models/ListingDraft");
const AppError = require("../utils/AppError");

const createListingDraft = asyncHandler(async (req, res) => {
  const draft = await listingDraftService.createListingDraft(
    req.body,
    req.user
  );

  res.status(201).json({
    success: true,
    data: draft,
  });
});

const submitForApproval = asyncHandler(async (req, res) => {
  const draft = await listingDraftService.submitForApproval(
    req.params.id,
    req.user
  );

  res.json({
    success: true,
    data: draft,
  });
});

const approveListing = asyncHandler(async (req, res) => {
  const draft = await listingDraftService.approveListing(
    req.params.id,
    req.user._id
  );

  res.json({
    success: true,
    data: draft,
  });
});

const getListingDraft = asyncHandler(async (req, res) => {
  const draft = await listingDraftService.getListingDraft(
    req.params.id,
    req.user
  );

  res.json({
    success: true,
    data: draft,
  });
});

const listListingDrafts = asyncHandler(async (req, res) => {
  const result = await listingDraftService.listListingDrafts(req.query, req.user);
  res.status(200).json({ success: true, count: result.drafts.length, data: result.drafts, pagination: result.pagination });
});

module.exports = {
  createListingDraft,
  submitForApproval,
  approveListing,
  getListingDraft,
  listListingDrafts,
};
