const AppError = require("../utils/AppError");

const DEVELOPMENT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

const getAllowedOrigins = () => {
  const configuredOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === "production") {
    return configuredOrigins;
  }

  return [...new Set([...DEVELOPMENT_ORIGINS, ...configuredOrigins])];
};

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || getAllowedOrigins().includes(origin)) {
      return callback(null, true);
    }

    return callback(
      new AppError(
        "Origin is not allowed by CORS policy.",
        403,
        "CORS_ORIGIN_DENIED"
      )
    );
  },
};

module.exports = {
  corsOptions,
  getAllowedOrigins,
};
