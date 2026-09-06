const mongoose = require("mongoose");
const PROPERTY_STATUS = require("../constants/propertyStatus");
const VERIFICATION_STATUS = require("../constants/verificationStatus");
const PROPERTY_VERIFICATION_STATUS = require("../constants/propertyVerificationStatus");
const PROPERTY_TYPES = require("../constants/propertyTypes");

const propertySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    price: {
      type: Number,
      required: true,
    },

    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
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

    listingType: {
      type: String,
      enum: ["Sale", "Rent"],
      required: true,
    },

    bedrooms: {
      type: Number,
      default: 0,
    },

    bathrooms: {
      type: Number,
      default: 0,
    },

    parkingSpaces: {
      type: Number,
      default: 0,
    },

    areaSize: {
      type: Number,
      default: 0,
    },

    furnished: {
      type: Boolean,
      default: false,
    },

    featured: {
      type: Boolean,
      default: false,
    },

    currency: {
      type: String,
      default: "GHS",
    },

    status: {
  type: String,
  enum: Object.values(PROPERTY_STATUS),
  default: PROPERTY_STATUS.AVAILABLE,
},

verificationStatus: {
  type: String,
  enum: Object.values(PROPERTY_VERIFICATION_STATUS),
  default: PROPERTY_VERIFICATION_STATUS.DRAFT,
},

owner: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
},

createdBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: true,
},

assignedAgent: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
},

verifiedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
},

verifiedAt: Date,

publishedAt: Date,

latitude: {
  type: Number,
  min: -90,
  max: 90,
},

longitude: {
  type: Number,
  min: -180,
  max: 180,
},

videoUrl: {
  type: String,
  default: "",
},

virtualTourUrl: {
  type: String,
  default: "",
},

amenities: [
  {
    type: String,
  },
],

inspectionNotes: {
  type: String,
  default: "",
},

negotiable: {
  type: Boolean,
  default: false,
},

isArchived: {
  type: Boolean,
  default: false,
},

    images: [
  {
    url: {
      type: String,
      required: true,
    },
    isCover: {
      type: Boolean,
      default: false,
    },
    caption: {
      type: String,
      default: "",
    },
  },
],
  },
  {
    timestamps: true,
  }
);

propertySchema.index({ listingType: 1 });
propertySchema.index({ propertyType: 1 });
propertySchema.index({ status: 1 });
propertySchema.index({ verificationStatus: 1 });
propertySchema.index({ featured: 1 });
propertySchema.index({ location: 1 });
propertySchema.index({ price: 1 });

propertySchema.index({
  title: "text",
  description: "text",
});

module.exports = mongoose.model("Property", propertySchema);
