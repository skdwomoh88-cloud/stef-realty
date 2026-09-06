const Settings = require("../models/Settings");
const safeErrorMessage = require("../utils/safeErrorMessage");
const UPDATABLE_FIELDS = [
  "companyName", "companyEmail", "companyPhone", "companyAddress", "logo",
  "heroTitle", "heroSubtitle", "heroDescription", "defaultCurrency",
  "defaultCountry", "viewingFee", "viewingFeeCurrency",
];
const PUBLIC_SETTINGS_SELECT = UPDATABLE_FIELDS.join(" ");

// Get settings
const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne().select(PUBLIC_SETTINGS_SELECT);

    if (!settings) {
      settings = await Settings.create({});
    }

    res.json(settings);

  } catch (error) {
    res.status(500).json({
      message: safeErrorMessage(error, "Internal Server Error"),
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

    for (const field of UPDATABLE_FIELDS) {
      if (req.body[field] !== undefined) settings[field] = req.body[field];
    }

    await settings.save();

    res.json(settings);

  } catch (error) {
    res.status(500).json({
      message: safeErrorMessage(error, "Internal Server Error"),
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};
