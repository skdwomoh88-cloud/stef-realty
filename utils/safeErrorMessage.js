const safeErrorMessage = (
  error,
  fallback = "Request could not be processed"
) => {
  if (process.env.NODE_ENV === "production" && !error.isOperational) {
    return fallback;
  }

  return error.message || fallback;
};

module.exports = safeErrorMessage;
