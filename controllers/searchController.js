const Property = require("../models/Property");
const User = require("../models/User");
const ViewingRequest = require("../models/ViewingRequest");
const PropertySubmission = require("../models/PropertySubmission");

const globalSearch = async (req, res) => {
  try {
    const q = req.query.q?.trim();

    if (!q) {
      return res.json([]);
    }

    const regex = new RegExp(q, "i");

    const [
      properties,
      users,
      viewingRequests,
      submissions,
    ] = await Promise.all([

      Property.find({
  $or: [
    { title: regex },
    { location: regex },
  ],
})
.select("_id title location price")
.limit(5),

      User.find({
  $or: [
    { name: regex },
    { email: regex },
  ],
})
.select("_id name email role")
.limit(5),

      ViewingRequest.find({
  $or: [
    { fullName: regex },
    { email: regex },
  ],
})
.select("_id fullName status property")
.populate("property", "title")
.limit(5),

      PropertySubmission.find({
  ownerName: regex,
})
.select("_id ownerName status")
.limit(5),

    ]);

    res.json({
      properties,
      users,
      viewingRequests,
      submissions,
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};

module.exports = {
  globalSearch,
};