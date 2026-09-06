const express = require("express");

const router = express.Router();

const {
  getSettings,
  updateSettings,
} = require("../controllers/settingsController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");
const validate = require("../middleware/validationMiddleware");
const settingsValidator = require("../validators/settingsValidator");

router.get("/", getSettings);

router.put(
  "/",
  protect,
  authorize("Admin"),
  settingsValidator,
  validate,
  updateSettings
);

module.exports = router;
