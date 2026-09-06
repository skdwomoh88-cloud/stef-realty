const express = require("express");
const router = express.Router();
const ROLES = require("../constants/roles");
const { protect, authorize } = require("../middleware/authMiddleware");
const validate = require("../middleware/validationMiddleware");
const validateDocumentUpload = require("../middleware/documentValidationMiddleware");
const { uploadDocument } = require("../middleware/documentUploadMiddleware");
const {
  documentCreateValidator,
  documentUpdateValidator,
  documentIdValidator,
  documentListValidator,
} = require("../validators/documentValidator");
const controller = require("../controllers/documentController");

router.use(protect, authorize(ROLES.ADMIN, ROLES.AGENT));

router.post(
  "/",
  uploadDocument,
  documentCreateValidator,
  validateDocumentUpload,
  controller.createDocument
);
router.get("/", documentListValidator, validate, controller.getDocuments);
router.get("/my", documentListValidator, validate, controller.getMyDocuments);
router.get("/:id/file", documentIdValidator, validate, controller.downloadDocument);
router.get("/:id", documentIdValidator, validate, controller.getDocumentById);
router.put("/:id", documentIdValidator, documentUpdateValidator, validate, controller.updateDocument);
router.delete("/:id", documentIdValidator, validate, controller.archiveDocument);

module.exports = router;
