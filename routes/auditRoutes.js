const express = require("express");
const controller = require("../controllers/auditController");
const validator = require("../validators/auditValidator");
const validate = require("../middleware/validationMiddleware");
const { protect } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../constants/permissions");

const router = express.Router();
router.use(protect, requirePermission(PERMISSIONS.AUDIT_LOG_VIEW));
router.get("/events", validator.listEvents, validate, controller.listEvents);
router.get("/events/:id", validator.eventId, validate, controller.getEvent);

module.exports = router;
