const express = require("express");
const router = express.Router();

const {
  createListingDraft,
  submitForApproval,
  approveListing,
  getListingDraft,
  listListingDrafts,
} = require("../controllers/listingDraftController");

const { protect, authorize } = require("../middleware/authMiddleware");

const ROLES = require("../constants/roles");
const validate = require("../middleware/validationMiddleware");
const { listingDraftListQueryValidator } = require("../validators/frontendListValidator");

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  listingDraftListQueryValidator,
  validate,
  listListingDrafts
);

router.post(
  "/",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  createListingDraft
);

router.put(
  "/:id/submit",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  submitForApproval
);

router.put(
  "/:id/approve",
  protect,
  authorize(ROLES.ADMIN),
  approveListing
);

router.get(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getListingDraft
);

module.exports = router;
