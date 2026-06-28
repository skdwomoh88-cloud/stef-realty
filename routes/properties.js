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

const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.get("/", getProperties);

router.get("/search", searchProperties);

router.get("/:id", getPropertyById);

router.post(
  "/upload",
  protect,
  upload.array("images", 10),
  (req, res) => {
    const imageUrls = req.files.map(
  (file) =>
    `${req.protocol}://${req.get("host")}/uploads/${file.filename}`
);

res.json(imageUrls);
  }
);

router.post("/", protect, createProperty);

router.put("/:id", protect, updateProperty);

router.delete("/:id", protect, deleteProperty);

module.exports = router;