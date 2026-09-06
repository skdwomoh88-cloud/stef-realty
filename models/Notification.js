const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: [
        "Property",
        "Inquiry",
        "Viewing Request",
        "Offer",
        "Deal",
        "Task",
        "Feedback",
        "Property Request",
        "System",
      ],
      required: true,
    },

    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    relatedProperty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      default: null,
    },

    relatedInquiry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Inquiry",
      default: null,
    },

    relatedViewingRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ViewingRequest",
      default: null,
    },

    relatedOffer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      default: null,
    },

    relatedDeal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deal",
      default: null,
    },

    relatedTask: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },

    relatedFeedback: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Feedback",
      default: null,
    },

    relatedPropertyRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyRequest",
      default: null,
    },

    relatedPropertySubmission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertySubmission",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
