const express = require("express");

const router = express.Router();

const {
  createViewingRequest,
} = require("../controllers/viewingRequestController");

router.post("/", createViewingRequest);

module.exports = router;