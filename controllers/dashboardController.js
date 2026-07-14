const Property = require("../models/Property");
const PropertySubmission = require("../models/PropertySubmission");
const User = require("../models/User");
const ViewingRequest = require("../models/ViewingRequest");

const getDashboardStats = async (req, res) => {
  try {
    const [
      properties,
      pendingSubmissions,
      users,
      viewingRequests,
      featuredProperties,
      soldProperties,
    ] = await Promise.all([
      Property.countDocuments(),
      PropertySubmission.countDocuments({
        status: "Pending",
      }),
      User.countDocuments(),
      ViewingRequest.countDocuments(),
      Property.countDocuments({
        status: "Featured",
      }),
      Property.countDocuments({
        status: "Sold",
      }),
    ]);

    res.json({
      properties,
      pendingSubmissions,
      users,
      viewingRequests,
      featuredProperties,
      soldProperties,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getDashboardAnalytics = async (req, res) => {
  try {
    // Properties by category
    const propertiesByCategory = await Property.aggregate([
      {
        $group: {
          _id: "$category",
          total: { $sum: 1 },
        },
      },
    ]);

    // Sale vs Rent
    const listingTypes = await Property.aggregate([
      {
        $group: {
          _id: "$listingType",
          total: { $sum: 1 },
        },
      },
    ]);

    // Viewing requests by status
    const viewingRequestsByStatus =
      await ViewingRequest.aggregate([
        {
          $group: {
            _id: "$status",
            total: { $sum: 1 },
          },
        },
      ]);

    const categoryData = {
  Residential: 0,
  Commercial: 0,
};

propertiesByCategory.forEach((item) => {
  categoryData[item._id] = item.total;
});

const listingTypeData = {
  Sale: 0,
  Rent: 0,
};

listingTypes.forEach((item) => {
  listingTypeData[item._id] = item.total;
});

const viewingStatusData = {
  Pending: 0,
  Confirmed: 0,
  Completed: 0,
  Cancelled: 0,
};

viewingRequestsByStatus.forEach((item) => {
  viewingStatusData[item._id] = item.total;
});

res.json({
  propertiesByCategory: categoryData,
  listingTypes: listingTypeData,
  viewingRequestsByStatus: viewingStatusData,
});

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const getDashboardActivity = async (req, res) => {
  try {
    const today = new Date();

    // Start of today
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);

    // End of today
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const [
      todayFollowUps,
      highPriorityLeads,
      recentViewingRequests,
      recentSubmissions,
    ] = await Promise.all([

      ViewingRequest.find({
        nextFollowUp: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      })
        .populate("property", "title")
        .populate("assignedAgent", "name")
        .sort({ nextFollowUp: 1 })
        .limit(10),

      ViewingRequest.find({
        priority: "High",
      })
        .populate("property", "title")
        .populate("assignedAgent", "name")
        .sort({ createdAt: -1 })
        .limit(10),

      ViewingRequest.find()
        .populate("property", "title")
        .sort({ createdAt: -1 })
        .limit(10),

      PropertySubmission.find()
        .sort({ createdAt: -1 })
        .limit(10),

    ]);

    res.json({
      todayFollowUps,
      highPriorityLeads,
      recentViewingRequests,
      recentSubmissions,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
  getDashboardAnalytics,
  getDashboardActivity,
};