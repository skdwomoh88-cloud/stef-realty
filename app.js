const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const errorHandler = require("./middleware/errorMiddleware");
const { corsOptions } = require("./config/cors");
const AppError = require("./utils/AppError");
const { correlationId } = require("./middleware/correlationId");

const app = express();

const configuredTrustProxyHops = Number(process.env.TRUST_PROXY_HOPS);

if (
  Number.isInteger(configuredTrustProxyHops) &&
  configuredTrustProxyHops > 0
) {
  app.set("trust proxy", configuredTrustProxyHops);
}

app.disable("x-powered-by");
app.use(correlationId);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  strictTransportSecurity:
    process.env.NODE_ENV === "production"
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
}));
app.use(cors(corsOptions));
app.use(express.json({
  limit: process.env.JSON_BODY_LIMIT || "2mb",
}));
app.use(express.urlencoded({
  extended: true,
  limit: process.env.URLENCODED_BODY_LIMIT || "2mb",
}));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.json({ success: true, message: "REAL ESTATE API is running..." });
});

app.get("/health", (req, res) => {
  res.json({ success: true, status: "ok" });
});

app.use("/properties", require("./routes/properties"));
app.use("/auth", require("./routes/auth"));
app.use("/property-submissions", require("./routes/propertySubmissionRoutes"));
app.use("/viewing-requests", require("./routes/viewingRequestRoutes"));
app.use("/dashboard", require("./routes/dashboardRoutes"));
app.use("/settings", require("./routes/settingsRoutes"));
app.use("/users", require("./routes/userRoutes"));
app.use("/search", require("./routes/searchRoutes"));
app.use("/locations", require("./routes/locationRoutes"));
app.use("/cases", require("./routes/caseRoutes"));
app.use("/inspections", require("./routes/inspectionRoutes"));
app.use("/listing-drafts", require("./routes/listingDraftRoutes"));
app.use("/inquiries", require("./routes/inquiryRoutes"));
app.use("/notifications", require("./routes/notificationRoutes"));
app.use("/offers", require("./routes/offerRoutes"));
app.use("/deals", require("./routes/dealRoutes"));
app.use("/tasks", require("./routes/taskRoutes"));
app.use("/documents", require("./routes/documentRoutes"));
app.use("/feedback", require("./routes/feedbackRoutes"));
app.use("/property-requests", require("./routes/propertyRequestRoutes"));
app.use("/organization", require("./routes/organizationRoutes"));
app.use("/audit", require("./routes/auditRoutes"));

app.use((req, res, next) => {
  next(
    new AppError(
      `Route not found: ${req.originalUrl}`,
      404,
      "NOT_FOUND"
    )
  );
});

app.use(errorHandler);

module.exports = app;
