const multer = require("multer");
const path = require("path");
const AppError = require("../utils/AppError");

const configuredFileSizeMb = Number(process.env.MAX_UPLOAD_FILE_SIZE_MB);
const configuredFileCount = Number(process.env.MAX_UPLOAD_FILES);

const maxFileSizeMb =
  Number.isFinite(configuredFileSizeMb) && configuredFileSizeMb > 0
    ? configuredFileSizeMb
    : 5;

const maxFileCount =
  Number.isInteger(configuredFileCount) && configuredFileCount > 0
    ? configuredFileCount
    : 10;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    cb(
      null,
      `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`
    );
  },
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
  ];

  const extension = path.extname(file.originalname).toLowerCase();

  if (
    file.mimetype.startsWith("image/") &&
    allowedExtensions.includes(extension)
  ) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        "Only image files are allowed",
        400,
        "UPLOAD_TYPE_INVALID"
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSizeMb * 1024 * 1024,
    files: maxFileCount,
  },
});

upload.maxFileCount = maxFileCount;

module.exports = upload;
