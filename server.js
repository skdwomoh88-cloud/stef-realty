require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/db");
const mongoose = require("mongoose");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }

  await connectDB();

  return app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

if (require.main === module) {
  let server;
  let shuttingDown = false;

  const shutdown = async (reason, exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`Shutting down: ${reason}`);

    try {
      if (server) {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }

      await mongoose.disconnect();
    } catch (error) {
      console.error(`Shutdown failed: ${error.message}`);
      exitCode = 1;
    } finally {
      process.exitCode = exitCode;
    }
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("unhandledRejection", (error) => {
    console.error(`Unhandled rejection: ${error.message}`);
    shutdown("unhandled rejection", 1);
  });
  process.once("uncaughtException", (error) => {
    console.error(`Uncaught exception: ${error.message}`);
    shutdown("uncaught exception", 1);
  });

  startServer().then((startedServer) => {
    server = startedServer;
  }).catch((error) => {
    console.error(`Failed to start server: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { startServer };
