const errorHandler = (err, req, res, next) => {
  const originalCode = err.code;
  let statusCode = err.statusCode || err.status || 500;
  let code = typeof err.code === "string" ? err.code : "SERVER_ERROR";
  let message = err.message || "Internal Server Error";
  let safeError = Boolean(err.isOperational);

  if (err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_ID";
    message = "Invalid resource identifier";
    safeError = true;
  } else if (err.name === "ValidationError") {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Validation failed";
    safeError = true;
  } else if (originalCode === 11000) {
    statusCode = 409;
    code = "DUPLICATE_RESOURCE";
    message = "A resource with those details already exists";
    safeError = true;
  } else if (err.type === "entity.parse.failed") {
    statusCode = 400;
    code = "MALFORMED_JSON";
    message = "Malformed JSON request body";
    safeError = true;
  } else if (err.type === "entity.too.large") {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request payload is too large";
    safeError = true;
  } else if (err.name === "MulterError") {
    const uploadTooLarge = [
      "LIMIT_FILE_SIZE",
      "LIMIT_FILE_COUNT",
      "LIMIT_PART_COUNT",
    ].includes(err.code);
    statusCode = uploadTooLarge ? 413 : 400;
    code = uploadTooLarge ? "UPLOAD_TOO_LARGE" : "UPLOAD_ERROR";
    message = uploadTooLarge
      ? "Uploaded files exceed the configured limit"
      : "File upload failed";
    safeError = true;
  } else if (
    err.name === "JsonWebTokenError" ||
    err.name === "TokenExpiredError" ||
    err.name === "NotBeforeError"
  ) {
    statusCode = 401;
    code = "UNAUTHORIZED";
    message = "Not authorized. Invalid token.";
    safeError = true;
  }

  if (process.env.NODE_ENV === "production" && statusCode >= 500) {
    message = "Internal Server Error";
  } else if (process.env.NODE_ENV === "production" && !safeError) {
    message = "Request could not be processed";
  }

  if (statusCode >= 500) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[${code}] ${err.message || "Unknown server error"}`);
    } else {
      console.error(err);
    }
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};

module.exports = errorHandler;
