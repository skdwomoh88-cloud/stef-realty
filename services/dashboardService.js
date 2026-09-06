const Property = require("../models/Property");
const Case = require("../models/Case");
const Inquiry = require("../models/Inquiry");
const User = require("../models/User");
const PropertySubmission = require("../models/PropertySubmission");
const ViewingRequest = require("../models/ViewingRequest");

const PROPERTY_STATUS = require("../constants/propertyStatus");
const PROPERTY_VERIFICATION_STATUS = require("../constants/propertyVerificationStatus");
const INQUIRY_STATUS = require("../constants/inquiryStatus");
const { ROLES } = require("../constants/roleCatalogue");
const { getStoredRoleValuesForCanonicalRole } = require("../utils/rbac");

const getAdminDashboard = async () => {
  const [
    totalProperties,
    availableProperties,
    draftProperties,
    verifiedProperties,
    archivedProperties,

    totalCases,

    totalInquiries,
    newInquiries,

    totalUsers,
    totalAgents,
    totalOwners,
  ] = await Promise.all([
    Property.countDocuments(),

    Property.countDocuments({
      status: PROPERTY_STATUS.AVAILABLE,
    }),

    Property.countDocuments({
      verificationStatus: PROPERTY_VERIFICATION_STATUS.DRAFT,
    }),

    Property.countDocuments({
      verificationStatus:
        PROPERTY_VERIFICATION_STATUS.VERIFIED,
    }),

    Property.countDocuments({
      isArchived: true,
    }),

    Case.countDocuments(),

    Inquiry.countDocuments(),

    Inquiry.countDocuments({
      status: INQUIRY_STATUS.NEW,
    }),

    User.countDocuments(),

    User.countDocuments({
      role: { $in: getStoredRoleValuesForCanonicalRole(ROLES.AGENT) },
    }),

    User.countDocuments({
      role: { $in: getStoredRoleValuesForCanonicalRole(ROLES.OWNER) },
    }),
  ]);

  return {
    properties: {
      total: totalProperties,
      available: availableProperties,
      draft: draftProperties,
      verified: verifiedProperties,
      archived: archivedProperties,
    },

    cases: {
      total: totalCases,
    },

    inquiries: {
      total: totalInquiries,
      new: newInquiries,
    },

    users: {
      total: totalUsers,
      agents: totalAgents,
      owners: totalOwners,
    },
  };
};

const getDashboardStats = async () => {
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
      status: {
        $in: [
          "Pending Review",
          "Inspection Scheduled",
          "Inspection Completed",
          "Documents Under Review",
        ],
      },
    }),

    User.countDocuments(),

    ViewingRequest.countDocuments(),

    Property.countDocuments({
      featured: true,
    }),

    Property.countDocuments({
      status: PROPERTY_STATUS.SOLD,
    }),
  ]);

  return {
    properties,
    pendingSubmissions,
    users,
    viewingRequests,
    featuredProperties,
    soldProperties,
  };
};

const getDashboardAnalytics = async () => {
  const [
    propertiesByCategory,
    listingTypes,
    viewingRequestsByStatus,
  ] = await Promise.all([
    Property.aggregate([
      {
        $group: {
          _id: "$category",
          total: { $sum: 1 },
        },
      },
    ]),

    Property.aggregate([
      {
        $group: {
          _id: "$listingType",
          total: { $sum: 1 },
        },
      },
    ]),

    ViewingRequest.aggregate([
      {
        $group: {
          _id: "$status",
          total: { $sum: 1 },
        },
      },
    ]),
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

  return {
    propertiesByCategory: categoryData,
    listingTypes: listingTypeData,
    viewingRequestsByStatus: viewingStatusData,
  };
};

const getDashboardActivity = async () => {
  const ACTIVITY_LIMIT = 5;
  const ACTION_LIMIT = 10;

  const today = new Date();

  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const [
    propertySubmissions,
    inquiries,
    viewingRequests,
    publishedProperties,

    pendingSubmissions,
    unassignedInquiries,
    unassignedViewingRequests,
    highPriorityViewingRequests,

    inquiryFollowUps,
    viewingFollowUps,
  ] = await Promise.all([
    // =========================
    // Activity Feed
    // =========================

    PropertySubmission.find()
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_LIMIT),

    Inquiry.find()
      .populate("property", "title")
      .populate("assignedAgent", "name")
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_LIMIT),

    ViewingRequest.find()
      .populate("property", "title")
      .populate("assignedAgent", "name")
      .sort({ createdAt: -1 })
      .limit(ACTIVITY_LIMIT),

    Property.find({
      publishedAt: { $ne: null },
    })
      .sort({ publishedAt: -1 })
      .limit(ACTIVITY_LIMIT),

    // =========================
    // Action Center
    // =========================

    PropertySubmission.find({
      status: {
        $in: [
          "Pending Review",
          "Inspection Scheduled",
          "Inspection Completed",
          "Documents Under Review",
        ],
      },
    })
      .sort({ createdAt: -1 })
      .limit(ACTION_LIMIT),

    Inquiry.find({
      assignedAgent: null,
    })
      .populate("property", "title")
      .sort({ createdAt: -1 })
      .limit(ACTION_LIMIT),

    ViewingRequest.find({
      assignedAgent: null,
    })
      .populate("property", "title")
      .sort({ createdAt: -1 })
      .limit(ACTION_LIMIT),

    ViewingRequest.find({
      priority: "High",
    })
      .populate("property", "title")
      .populate("assignedAgent", "name")
      .sort({ createdAt: -1 })
      .limit(ACTION_LIMIT),

    // =========================
    // Today's Follow-ups
    // =========================

    Inquiry.find({
      nextFollowUp: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .populate("property", "title")
      .populate("assignedAgent", "name")
      .sort({ nextFollowUp: 1 }),

    ViewingRequest.find({
      nextFollowUp: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .populate("property", "title")
      .populate("assignedAgent", "name")
      .sort({ nextFollowUp: 1 }),
  ]);

  return {
    activityFeed: {
      propertySubmissions,
      inquiries,
      viewingRequests,
      publishedProperties,
    },

    actionCenter: {
      pendingSubmissions,
      unassignedInquiries,
      unassignedViewingRequests,
      highPriorityViewingRequests,

      todaysFollowUps: {
        inquiries: inquiryFollowUps,
        viewingRequests: viewingFollowUps,
      },
    },
  };
};

module.exports = {
  getAdminDashboard,
  getDashboardStats,
  getDashboardAnalytics,
  getDashboardActivity,
};
