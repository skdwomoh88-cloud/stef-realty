const { validationResult } = require("express-validator");
const { removeStoredDocument } = require("../utils/documentStorage");

const validateDocumentUpload = async (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  if (req.file?.filename) {
    try {
      await removeStoredDocument(req.file.filename);
    } catch (error) {
      return next(error);
    }
  }

  return res.status(400).json({
    success: false,
    error: { code: "VALIDATION_ERROR", message: "Validation failed" },
    errors: errors.array().map((error) => ({ field: error.path, message: error.msg })),
  });
};

module.exports = validateDocumentUpload;
