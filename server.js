require("dotenv").config();

const connectDB = require("./config/db");

const path = require("path");

const express = require("express");

const cors = require("cors");

const app = express();

const settingsRoutes = require("./routes/settingsRoutes");

const searchRoutes = require("./routes/searchRoutes");

const locationRoutes = require("./routes/locationRoutes");

const errorHandler = require("./middleware/errorMiddleware");

app.use(cors());

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

app.use("/uploads", express.static("uploads"));

connectDB();

const viewingRequestRoutes = require("./routes/viewingRequestRoutes");

const dashboardRoutes = require("./routes/dashboardRoutes");

const propertyRoutes = require("./routes/properties");
const authRoutes = require("./routes/auth");

const propertySubmissionRoutes = require(
  "./routes/propertySubmissionRoutes"
);

const userRoutes = require("./routes/userRoutes");

const notificationRoutes = require(
  "./routes/notificationRoutes"
);

app.get("/", (req, res) => {
  res.send("REAL ESTATE API is running...");
});

app.use("/properties", propertyRoutes);
app.use("/auth", authRoutes);
app.use("/property-submissions", propertySubmissionRoutes);
app.use("/viewing-requests", viewingRequestRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/settings", settingsRoutes);
app.use("/users", userRoutes);
app.use("/notifications", notificationRoutes);
app.use("/search", searchRoutes);
app.use("/locations", locationRoutes);

app.use((req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  next(error);
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});