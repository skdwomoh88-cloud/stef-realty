const express = require("express");

const router = express.Router();

const {
  getRegions,
  getCities,
  getAreas,
  getAllLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} = require("../controllers/locationController");

router.get("/regions", getRegions);

router.get("/cities/:region", getCities);

router.get("/areas/:region/:city", getAreas);

router.get("/", getAllLocations);

router.post("/", createLocation);

router.put("/:id", updateLocation);

router.delete("/:id", deleteLocation);

module.exports = router;