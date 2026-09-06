const mongoose = require("mongoose");
const VIEWING_PAYMENT_STATUS = require("../constants/viewingPaymentStatus");

const ViewingRequestSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      default: null,
    },

    properties: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
    }],

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

paymentStatus: {
  type: String,
  enum: Object.values(VIEWING_PAYMENT_STATUS),
  default: VIEWING_PAYMENT_STATUS.PENDING,
},

paymentReference: { type: String, default: null },
amountDue: { type: Number, min: 0, default: null },
currency: { type: String, trim: true, uppercase: true, default: null },
paidAt: { type: Date, default: null },

feedbackTokenHash: {
  type: String,
  default: null,
  select: false,
},

feedbackTokenExpiresAt: {
  type: Date,
  default: null,
  select: false,
},

feedbackTokenUsedAt: {
  type: Date,
  default: null,
  select: false,
},

  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.feedbackTokenHash;
        delete ret.feedbackTokenExpiresAt;
        delete ret.feedbackTokenUsedAt;
        return ret;
      },
    },
    toObject: {
      transform: (doc, ret) => {
        delete ret.feedbackTokenHash;
        delete ret.feedbackTokenExpiresAt;
        delete ret.feedbackTokenUsedAt;
        return ret;
      },
    },
  }
);

ViewingRequestSchema.pre("validate", function ensurePropertySelection() {
  if ((!this.properties || this.properties.length === 0) && this.property) {
    this.properties = [this.property];
  }
  if (!this.property && this.properties && this.properties.length > 0) {
    this.property = this.properties[0];
  }
  if (!this.property && (!this.properties || this.properties.length === 0)) {
    this.invalidate("properties", "At least one property is required");
  }
});

ViewingRequestSchema.index({ properties: 1 });

module.exports = mongoose.model(
  "ViewingRequest",
  ViewingRequestSchema
);
