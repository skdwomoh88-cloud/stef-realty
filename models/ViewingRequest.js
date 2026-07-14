const mongoose = require("mongoose");

const ViewingRequestSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    preferredDate: {
      type: Date,
      required: true,
    },

    preferredTime: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "Completed",
        "Cancelled",
      ],
      default: "Pending",
    },

    assignedAgent: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},

priority: {
  type: String,
  enum: ["Low", "Medium", "High"],
  default: "Medium",
},

nextFollowUp: {
  type: Date,
  default: null,
},

internalNotes: {
  type: String,
  default: "",
},

  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "ViewingRequest",
  ViewingRequestSchema
);