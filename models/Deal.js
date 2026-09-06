const mongoose = require("mongoose");
const DEAL_STATUS = require("../constants/dealStatus");

const DealSchema = new mongoose.Schema(
  {
    dealNumber: {
      type: String,
      unique: true,
    },

    offer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Offer",
      required: true,
      unique: true,
    },

    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },

    customerName: {
      type: String,
      required: true,
      trim: true,
    },

    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    customerPhone: {
      type: String,
      required: true,
      trim: true,
    },

    salePrice: {
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
    },

    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: Object.values(DEAL_STATUS),
      default: DEAL_STATUS.ACTIVE,
    },

    nextFollowUp: {
      type: Date,
      default: null,
    },

    internalNotes: {
      type: String,
      default: "",
    },

    payments: [
      {
        amount: {
          type: Number,
          required: true,
        },

        paymentDate: {
          type: Date,
          required: true,
        },

        paymentMethod: {
          type: String,
          required: true,
        },

        referenceNumber: {
          type: String,
          default: "",
        },

        notes: {
          type: String,
          default: "",
        },

        recordedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      },
    ],

    commission: {
      amount: {
        type: Number,
        default: 0,
      },

      percentage: {
        type: Number,
        default: 0,
      },

      status: {
        type: String,
        enum: ["Pending", "Paid"],
        default: "Pending",
      },

      paidDate: {
        type: Date,
        default: null,
      },

      notes: {
        type: String,
        default: "",
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Deal", DealSchema);
