const Settings = require("../models/Settings");

// Get settings
const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({});
    }

    res.json(settings);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Update settings
const updateSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create({});
    }

    Object.assign(settings, req.body);

    await settings.save();

    res.json(settings);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};