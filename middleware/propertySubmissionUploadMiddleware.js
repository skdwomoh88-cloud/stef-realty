const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { validationResult } = require("express-validator");
const AppError = require("../utils/AppError");

const applicationRoot = path.resolve(__dirname, "..");
const propertySubmissionUploadRoot = path.resolve(applicationRoot, "uploads", "property-submissions");
const minPropertySubmissionImages = 3;
const maxPropertySubmissionImages = 10;
const configuredFileSizeMb = Number(process.env.MAX_UPLOAD_FILE_SIZE_MB);
const maxPropertySubmissionImageSizeMb =
  Number.isFinite(configuredFileSizeMb) && configuredFileSizeMb > 0 ? configuredFileSizeMb : 5;
const allowedImageTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

fs.mkdirSync(propertySubmissionUploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, propertySubmissionUploadRoot),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomBytes(16).toString("hex")}${extension}`);
  },
});

const uploader = multer({
  storage,
  limits: {
    fileSize: maxPropertySubmissionImageSizeMb * 1024 * 1024,
    files: maxPropertySubmissionImages,
  },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedImageTypes.get(extension) !== file.mimetype) {
      return callback(new AppError(
        "Only JPEG, PNG, and WebP property photos are allowed.",
        400,
        "PROPERTY_SUBMISSION_IMAGE_TYPE_INVALID"
      ));
    }
    callback(null, true);
  },
});

const resolveUploadedFile = (file) => {
  const resolved = path.resolve(file.path);
  if (path.dirname(resolved) !== propertySubmissionUploadRoot) {
    throw new AppError("Invalid property photo path.", 400, "PROPERTY_SUBMISSION_IMAGE_PATH_INVALID");
  }
  return resolved;
};

const cleanupPropertySubmissionUploads = async (files = []) => {
  await Promise.all((files || []).map(async (file) => {
    try {
      await fs.promises.unlink(resolveUploadedFile(file));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }));
};

const uploadPropertySubmissionImages = (req, res, next) => {
  uploader.array("images", maxPropertySubmissionImages)(req, res, async (error) => {
    if (error) {
      await cleanupPropertySubmissionUploads(req.files).catch(() => {});
      if (error instanceof multer.MulterError) {
        const tooLarge = ["LIMIT_FILE_SIZE", "LIMIT_FILE_COUNT", "LIMIT_UNEXPECTED_FILE"].includes(error.code);
        return next(new AppError(
          tooLarge ? "Property photos exceed the configured upload limits." : "Property photo upload failed.",
          tooLarge ? 413 : 400,
          tooLarge ? "PROPERTY_SUBMISSION_IMAGES_LIMIT_EXCEEDED" : "PROPERTY_SUBMISSION_IMAGE_UPLOAD_FAILED"
        ));
      }
      return next(error);
    }
    if (!Array.isArray(req.files) || req.files.length < minPropertySubmissionImages) {
      await cleanupPropertySubmissionUploads(req.files).catch(() => {});
      return next(new AppError(
        "Please upload at least 3 property photos.",
        400,
        "PROPERTY_SUBMISSION_IMAGES_REQUIRED"
      ));
    }
    next();
  });
};

const validatePropertySubmissionAndCleanup = async (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  await cleanupPropertySubmissionUploads(req.files).catch(() => {});
  return res.status(400).json({
    success: false,
    error: { code: "VALIDATION_ERROR", message: "Validation failed" },
    errors: errors.array().map((error) => ({ field: error.path, message: error.msg })),
  });
};

module.exports = {
  allowedImageTypes,
  cleanupPropertySubmissionUploads,
  minPropertySubmissionImages,
  maxPropertySubmissionImages,
  maxPropertySubmissionImageSizeMb,
  propertySubmissionUploadRoot,
  uploadPropertySubmissionImages,
  validatePropertySubmissionAndCleanup,
};
