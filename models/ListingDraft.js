const mongoose = require("mongoose");
const LISTING_DRAFT_STATUS = require("../constants/listingDraftStatus");

const listingDraftSchema = new mongoose.Schema(
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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    headline: {
      type: String,
      required: true,
    },

    marketingDescription: {
      type: String,
      required: true,
    },

    seoTitle: String,

    seoDescription: String,

    status: {
  type: String,
  default: LISTING_DRAFT_STATUS.DRAFT,
  enum: Object.values(LISTING_DRAFT_STATUS),
},

    internalNotes: String,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "ListingDraft",
  listingDraftSchema
);