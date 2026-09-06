const express = require("express");
const controller = require("../controllers/propertyRequestController");
const validator = require("../validators/propertyRequestValidator");
const validate = require("../middleware/validationMiddleware");
const { protect, authorize } = require("../middleware/authMiddleware");
const ROLES = require("../constants/roles");

const router = express.Router();
router.post("/", validator.publicCreate, validate, controller.create);
router.get("/", protect, authorize(ROLES.ADMIN, ROLES.AGENT), validator.list, validate, controller.list);
router.put("/:id/assign", protect, authorize(ROLES.ADMIN), validator.assign, validate, controller.assign);
router.put("/:id", protect, authorize(ROLES.ADMIN, ROLES.AGENT), validator.update, validate, controller.update);
router.get("/:id", protect, authorize(ROLES.ADMIN, ROLES.AGENT), validator.id, validate, controller.getById);

module.exports = router;
