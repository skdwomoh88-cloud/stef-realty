const express = require("express");

const router = express.Router();

const validateOffer = require("../validators/offerValidator");
const validate = require("../middleware/validationMiddleware");
const updateOfferValidator = require("../validators/updateOfferValidator");
const updateOfferStatusValidator = require("../validators/updateOfferStatusValidator");
const { offerAssignmentValidator } = require("../validators/assignmentValidator");

const {
  createOffer,
  getAllOffers,
  getMyOffers,
  assignOffer,
  getOfferById,
  updateOfferStatus,
  updateOffer,
  deleteOffer,
} = require("../controllers/offerController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

const ROLES = require("../constants/roles");

// Public
router.post(
  "/",
  validateOffer,
  validate,
  createOffer
);

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  getAllOffers
);

router.get(
  "/my",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getMyOffers
);

router.get(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getOfferById
);

router.put(
  "/:id/assign",
  protect,
  authorize(ROLES.ADMIN),
  offerAssignmentValidator,
  validate,
  assignOffer
);

router.put(
  "/:id/status",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updateOfferStatusValidator,
  validate,
  updateOfferStatus
);

router.put(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updateOfferValidator,
  validate,
  updateOffer
);

router.delete(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  deleteOffer
);

module.exports = router;
