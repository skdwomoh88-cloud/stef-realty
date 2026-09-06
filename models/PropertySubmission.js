const mongoose = require("mongoose");
const PROPERTY_TYPES = require("../constants/propertyTypes");

const propertySubmissionSchema = new mongoose.Schema(
  {
    submissionReference: {
      type: String,
      unique: true,
      sparse: true,
      immutable: true,
      match: /^SR-PS-\d{4}-[A-Z0-9]{6}$/,
    },

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
      enum: PROPERTY_TYPES,
      default: "House",
    },

    locationNotListed: {
      type: Boolean,
      default: false,
    },

    region: {
      type: String,
      default: null,
      required() {
        return !this.locationNotListed;
      },
    },

    city: {
      type: String,
      default: null,
      required() {
        return !this.locationNotListed;
      },
    },

    area: {
      type: String,
      default: null,
      required() {
        return !this.locationNotListed;
      },
    },

    exactLocation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    images: {
      type: [{ type: String, required: true }],
      required: true,
      validate: [
        { validator: (images) => Array.isArray(images) && images.length >= 3, message: "At least 3 property photos are required" },
        { validator: (images) => Array.isArray(images) && images.length <= 10, message: "A maximum of 10 property photos is allowed" },
      ],
    },

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

    approvedProperty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      default: null,
    },

    assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    managerAssignedAt: { type: Date, default: null },
    managerAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    agentAssignedAt: { type: Date, default: null },
    agentAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    internalNotes: { type: String, default: "", maxlength: 5000 },
    workflowHistory: [{
      action: { type: String, required: true },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      actorRole: { type: String, required: true },
      from: { type: mongoose.Schema.Types.Mixed, default: null },
      to: { type: mongoose.Schema.Types.Mixed, default: null },
      note: { type: String, default: "", maxlength: 1000 },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "PropertySubmission",
  propertySubmissionSchema
);

propertySubmissionSchema.index({ status: 1, createdAt: -1 });
propertySubmissionSchema.index({ assignedManager: 1, status: 1, createdAt: -1 });
propertySubmissionSchema.index({ assignedAgent: 1, status: 1, createdAt: -1 });
