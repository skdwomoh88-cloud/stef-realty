const Location = require("../models/Location");
const safeErrorMessage = require("../utils/safeErrorMessage");

const createLocation = async (req, res) => {
  try {
    const location = await Location.create(req.body);
    res.status(201).json(location);
  } catch (err) {
    res.status(400).json({ message: safeErrorMessage(err) });
  }
};

const updateLocation = async (req, res) => {
  try {
    const location = await Location.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }

    res.json(location);
  } catch (err) {
    res.status(400).json({ message: safeErrorMessage(err) });
  }
};

const deleteLocation = async (req, res) => {
  try {
    const location = await Location.findByIdAndDelete(req.params.id);

    if (!location) {
      return res.status(404).json({ message: "Location not found" });
    }

    res.json({ message: "Location deleted" });
  } catch (err) {
    res.status(400).json({ message: safeErrorMessage(err) });
  }
};

const getAllLocations = async (req, res) => {
  try {
    const locations = await Location.find()
      .sort({
        region: 1,
        city: 1,
        area: 1,
      })
      .lean();

    const formatted = locations.map((location) => ({
      ...location,

      displayName: [
        location.area,
        location.city,
        location.region,
      ]
        .filter(Boolean)
        .join(", "),
    }));

    res.json(formatted);

  } catch (err) {

    res.status(500).json({
      message: safeErrorMessage(err, "Internal Server Error"),
    });

  }
};

const getRegions = async (req, res) => {
  const regions = await Location.distinct("region");
  res.json(regions.sort());
};

const getCities = async (req, res) => {
  const cities = await Location.distinct("city", {
    region: req.params.region,
  });

  res.json(cities.sort());
};

const getAreas = async (req, res) => {
  const areas = await Location.distinct("area", {
    region: req.params.region,
    city: req.params.city,
  });

  res.json(areas.sort());
};

module.exports = {
  getRegions,
  getCities,
  getAreas,
  getAllLocations,
  createLocation,
  updateLocation,
  deleteLocation,
};
