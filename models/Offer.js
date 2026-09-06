const mongoose = require("mongoose");
const OFFER_STATUS = require("../constants/offerStatus");

const OfferSchema = new mongoose.Schema(
  {
    offerNumber: {
      type: String,
      unique: true,
    },

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
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    offerAmount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "GHS",
    },

    termsOfPayment: {
      type: String,
      required: true,
      trim: true,
    },

    proposedCompletionDate: {
      type: Date,
      default: null,
    },

    offerExpiryDate: {
      type: Date,
      default: null,
    },

    conditions: {
      type: String,
      default: "",
    },

    message: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: Object.values(OFFER_STATUS),
      default: OFFER_STATUS.NEW,
    },

    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    assignedAt: {
      type: Date,
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

module.exports = mongoose.model("Offer", OfferSchema);