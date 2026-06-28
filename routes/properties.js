const express = require("express");
const router = express.Router();

const {
  getProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  searchProperties
} = require("../controllers/propertyController");

router.get("/", getProperties);

router.get("/search", searchProperties);

router.get("/:id", getPropertyById);

router.put("/:id", updateProperty);

router.delete("/:id", deleteProperty);

router.post("/", createProperty);

module.exports = router;