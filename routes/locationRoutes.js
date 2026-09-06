const express = require("express");

const router = express.Router();

const ROLES = require("../constants/roles");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

const {
  getRegions,
  getCities,
  getAreas,
  getAllLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} = require("../controllers/locationController");
const validate = require("../middleware/validationMiddleware");
const {
  createLocationValidator,
  updateLocationValidator,
} = require("../validators/locationValidator");

router.get("/regions", getRegions);

router.get("/cities/:region", getCities);

router.get("/areas/:region/:city", getAreas);

router.get("/", getAllLocations);

router.post(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  createLocationValidator,
  validate,
  createLocation
);

router.put(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  updateLocationValidator,
  validate,
  updateLocation
);

router.delete(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  deleteLocation
);

module.exports = router;
