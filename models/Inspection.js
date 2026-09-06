const mongoose = require("mongoose");
const INSPECTION_STATUS = require("../constants/inspectionStatus");

const inspectionSchema = new mongoose.Schema(
  {
    case: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Case",
      required: true,
    },

    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },

    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    scheduledDate: {
      type: Date,
      required: true,
    },

    status: {
  type: String,
  enum: Object.values(INSPECTION_STATUS),
  default: INSPECTION_STATUS.SCHEDULED,
},

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Inspection", inspectionSchema);