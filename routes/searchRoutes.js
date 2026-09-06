const express = require("express");

const router = express.Router();

const {
  globalSearch,
} = require("../controllers/searchController");

const {
  protect,
} = require("../middleware/authMiddleware");
const validate = require("../middleware/validationMiddleware");
const { searchQueryValidator } = require("../validators/queryValidator");

// Global Search
router.get(
  "/",
  protect,
  searchQueryValidator,
  validate,
  globalSearch
);

module.exports = router;
