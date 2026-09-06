const Property = require("../models/Property");
const User = require("../models/User");
const ViewingRequest = require("../models/ViewingRequest");
const PropertySubmission = require("../models/PropertySubmission");
const { ROLES } = require("../constants/roleCatalogue");
const { isRole, isPlatformAdministratorRole } = require("../utils/rbac");
const PROPERTY_STATUS = require("../constants/propertyStatus");
const PROPERTY_VERIFICATION_STATUS = require("../constants/propertyVerificationStatus");
const safeErrorMessage = require("../utils/safeErrorMessage");

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const globalSearch = async (req, res) => {
  try {
    const q = req.query.q?.trim();

    if (!q) {
      return res.json([]);
    }

    const regex = new RegExp(escapeRegex(q), "i");
    const currentUser = req.user;
    const publicPropertyFilter = {
      verificationStatus: PROPERTY_VERIFICATION_STATUS.VERIFIED,
      status: PROPERTY_STATUS.AVAILABLE,
      isArchived: false,
    };
    const propertyTextFilter = {
      $or: [
        { title: regex },
        { description: regex },
      ],
    };

    let propertyFilter;
    let propertySelect = "_id title location price status";
    let userSearch = Promise.resolve([]);
    let viewingRequestSearch = Promise.resolve([]);
    let submissionSearch = Promise.resolve([]);

    if (isPlatformAdministratorRole(currentUser.role)) {
      propertyFilter = propertyTextFilter;
      propertySelect = "_id title location price status verificationStatus owner createdBy assignedAgent";
      userSearch = User.find({
        $or: [{ name: regex }, { email: regex }],
      })
        .select("_id name email role isActive")
        .limit(5);
      viewingRequestSearch = ViewingRequest.find({
        $or: [{ fullName: regex }, { email: regex }],
      })
        .select("_id fullName status property assignedAgent")
        .populate("property", "title")
        .limit(5);
      submissionSearch = PropertySubmission.find({ ownerName: regex })
        .select("_id ownerName status")
        .limit(5);
    } else if (isRole(currentUser.role, ROLES.AGENT)) {
      propertyFilter = {
        $and: [
          propertyTextFilter,
          {
            $or: [
              publicPropertyFilter,
              { createdBy: currentUser._id },
            ],
          },
        ],
      };
      propertySelect = "_id title location price status verificationStatus createdBy";
      viewingRequestSearch = ViewingRequest.find({
        assignedAgent: currentUser._id,
        $or: [{ fullName: regex }, { email: regex }],
      })
        .select("_id fullName status property assignedAgent")
        .populate("property", "title")
        .limit(5);
    } else if (isRole(currentUser.role, ROLES.OWNER)) {
      propertyFilter = {
        $and: [propertyTextFilter, { owner: currentUser._id }],
      };
      propertySelect = "_id title location price status verificationStatus owner";
    } else {
      propertyFilter = {
        $and: [propertyTextFilter, publicPropertyFilter],
      };
    }

    const [
      properties,
      users,
      viewingRequests,
      submissions,
    ] = await Promise.all([

      Property.find(propertyFilter)
        .select(propertySelect)
        .limit(5),
      userSearch,
      viewingRequestSearch,
      submissionSearch,

    ]);

    res.json({
      properties,
      users,
      viewingRequests,
      submissions,
    });

  } catch (error) {

    res.status(500).json({
      message: safeErrorMessage(error, "Internal Server Error"),
    });

  }
};

module.exports = {
  globalSearch,
  escapeRegex,
};
