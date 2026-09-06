const express = require("express");
const router = express.Router();

const {
  validateProperty,
  updatePropertyValidator,
} = require("../validators/propertyValidator");
const validate = require("../middleware/validationMiddleware");
const ROLES = require("../constants/roles");

const {
  getProperties,
  getPropertyById,
  getPublicProperties,
  createProperty,
  updateProperty,
  deleteProperty,
  searchProperties,
  getManagementProperties,
} = require("../controllers/propertyController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { propertyQueryValidator } = require("../validators/queryValidator");
const { propertyManagementQueryValidator } = require("../validators/frontendListValidator");

router.get("/", propertyQueryValidator, validate, getProperties);

router.get("/search", propertyQueryValidator, validate, searchProperties);

router.get(
  "/public",
  propertyQueryValidator,
  validate,
  getPublicProperties
);

router.get(
  "/manage",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  propertyManagementQueryValidator,
  validate,
  getManagementProperties
);

router.get("/:id", getPropertyById);

router.post(
  "/upload",
  protect,
  authorize("Admin", "Agent"),
  upload.array("images", upload.maxFileCount),
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
  authorize(ROLES.ADMIN, ROLES.AGENT),
  validateProperty,
  validate,
  createProperty
);

router.put(
  "/:id",
  protect,
  authorize(ROLES.ADMIN, ROLES.AGENT),
  updatePropertyValidator,
  validate,
  updateProperty
);

router.delete(
  "/:id",
  protect,
  authorize(ROLES.ADMIN),
  deleteProperty
);

module.exports = router;
