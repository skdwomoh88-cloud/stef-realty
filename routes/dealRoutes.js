const express = require("express");
const router = express.Router();

const ROLES = require("../constants/roles");

const updateDealValidator = require("../validators/updateDealValidator");
const updateDealStatusValidator = require("../validators/updateDealStatusValidator");
const paymentValidator = require("../validators/paymentValidator");
const commissionValidator = require("../validators/commissionValidator");

const {
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
} = require("../controllers/dealController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

const validateDeal = require("../validators/dealValidator");
const validate = require("../middleware/validationMiddleware");

router.get(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  getAllDeals
);

router.get(
  "/my",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getMyDeals
);

router.get(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  getDealById
);

router.put(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updateDealValidator,
  validate,
  updateDeal
);

router.put(
  "/:id/status",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updateDealStatusValidator,
  validate,
  updateDealStatus
);

router.post(
  "/:id/payments",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  paymentValidator,
  validate,
  recordPayment
);

router.put(
  "/:id/commission",
  protect,
  authorize(ROLES.ADMIN),
  commissionValidator,
  validate,
  updateCommission
);

router.put(
  "/:id/close",
  protect,
  authorize(ROLES.ADMIN),
  closeDeal
);

router.delete(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  deleteDeal
);

router.post(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  validateDeal,
  validate,
  createDeal
);

module.exports = router;