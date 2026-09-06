const mongoose = require("mongoose");

const connectDB = async () => {
  const configuredTimeout = Number(
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS
  );

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS:
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 10000,
  });
  console.log("MongoDB Connected");
};

module.exports = connectDB;
