require("dotenv").config();

const connectDB = require("./config/db");

const express = require("express");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

connectDB();

const propertyRoutes = require("./routes/properties");
const authRoutes = require("./routes/auth");

app.get("/", (req, res) => {
  res.send("REAL ESTATE API is running...");
});

app.use("/properties", propertyRoutes);
app.use("/auth", authRoutes);

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});