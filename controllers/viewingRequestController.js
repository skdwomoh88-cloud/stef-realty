const ViewingRequest = require("../models/ViewingRequest");

const createViewingRequest = async (req, res) => {
  try {
    const request = new ViewingRequest(req.body);

    const savedRequest = await request.save();

    res.status(201).json(savedRequest);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createViewingRequest,
};