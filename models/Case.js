const mongoose = require("mongoose");

const CASE_STATUS = require("../constants/caseStatus");
const CASE_PRIORITY = require("../constants/casePriority");

const caseSchema = new mongoose.Schema(
  {
    caseNumber: {
      type: String,
      unique: true,
      required: true,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
    },

    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    status: {
      type: String,
      enum: Object.values(CASE_STATUS),
      default: CASE_STATUS.NEW_LEAD,
    },

    priority: {
      type: String,
      enum: Object.values(CASE_PRIORITY),
      default: CASE_PRIORITY.MEDIUM,
    },

    source: {
      type: String,
      default: "Website",
    },

    notes: {
      type: String,
      default: "",
    },

    history: [
  {
    status: {
      type: String,
      enum: Object.values(CASE_STATUS),
    },

    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    notes: {
      type: String,
      default: "",
    },

    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Case", caseSchema);