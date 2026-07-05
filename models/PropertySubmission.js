const mongoose = require("mongoose");

const propertySubmissionSchema = new mongoose.Schema(
  {
    ownerName: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      default: "",
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    askingPrice: {
      type: Number,
      required: true,
    },

    listingType: {
      type: String,
      enum: ["Sale", "Rent"],
      required: true,
    },

    category: {
      type: String,
      enum: ["Residential", "Commercial"],
      required: true,
    },

    propertyType: {
      type: String,
      default: "House",
    },

    region: {
      type: String,
      default: "",
    },

    city: {
      type: String,
      default: "",
    },

    area: {
      type: String,
      required: true,
    },

    images: [
      {
        type: String,
      },
    ],

    status: {
      type: String,
      enum: [
        "Pending Review",
        "Inspection Scheduled",
        "Inspection Completed",
        "Documents Under Review",
        "Approved",
        "Rejected",
      ],
      default: "Pending Review",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "PropertySubmission",
  propertySubmissionSchema
);