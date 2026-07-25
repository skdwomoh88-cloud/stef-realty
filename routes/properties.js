const express = require("express");
const router = express.Router();

const validateProperty = require("../validators/propertyValidator");
const validate = require("../middleware/validationMiddleware");

const {
  getProperties,
  getPropertyById,
  createProperty,
  updateProperty,
  deleteProperty,
  searchProperties
} = require("../controllers/propertyController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.get("/", getProperties);

router.get("/search", searchProperties);

router.get("/:id", getPropertyById);

router.post(
  "/upload",
  protect,
  authorize("Admin", "Agent"),
  upload.array("images", 10),
  (req, res) => {
    const imageUrls = req.files.map(
      (file) =>
        `${req.protocol}://${req.get("host")}/uploads/${file.filename}`
    );

    res.json({
      success: true,
      data: imageUrls,
    });
  }
);

router.post(
  "/",
  protect,
  authorize("Admin", "Agent"),
  validateProperty,
  validate,
  createProperty
);

router.put(
  "/:id",
  protect,
  authorize("Admin", "Agent"),
  updateProperty
);

router.delete(
  "/:id",
  protect,
  authorize("Admin"),
  deleteProperty
);

module.exports = router;