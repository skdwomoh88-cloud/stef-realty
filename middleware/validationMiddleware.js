const { validationResult } = require("express-validator");

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return next();
  }

  return res.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Validation failed",
    },
    errors: errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    })),
  });
};

module.exports = validate;