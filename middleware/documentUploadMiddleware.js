const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const AppError = require("../utils/AppError");
const { documentRoot, ensureDocumentRoot } = require("../utils/documentStorage");

ensureDocumentRoot();

const configuredSize = Number(process.env.MAX_DOCUMENT_FILE_SIZE_MB);
const maxFileSizeMb = Number.isFinite(configuredSize) && configuredSize > 0
  ? configuredSize
  : 10;

const allowedTypes = new Map([
  [".pdf", "application/pdf"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, documentRoot),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(16).toString("hex")}${extension}`);
  },
});

const uploader = multer({
  storage,
  limits: { fileSize: maxFileSizeMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.get(extension) !== file.mimetype) {
      return cb(new AppError(
        "Only PDF, JPEG, and PNG documents are allowed.",
        400,
        "INVALID_DOCUMENT_TYPE"
      ));
    }
    cb(null, true);
  },
});

const uploadDocument = (req, res, next) => {
  uploader.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new AppError(
        "Document exceeds the configured file-size limit.",
        413,
        "DOCUMENT_TOO_LARGE"
      ));
    }
    next(error);
  });
};

module.exports = { uploadDocument, maxFileSizeMb };
