const Property = require("../models/Property");
const PropertySubmission = require("../models/PropertySubmission");
const ViewingRequest = require("../models/ViewingRequest");

const getDashboardStats = async (req, res) => {
  try {
    const [
      properties,
      pendingSubmissions,
      viewingRequests,
      publishedListings,
    ] = await Promise.all([
      Property.countDocuments(),
      PropertySubmission.countDocuments({
        status: "Pending Review",
      }),
      ViewingRequest.countDocuments(),
      Property.countDocuments({
        status: "Available",
      }),
    ]);

    res.json({
      properties,
      pendingSubmissions,
      viewingRequests,
      publishedListings,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
};