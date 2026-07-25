const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      default: "Ghana",
      index: true,
    },

    region: {
      type: String,
      required: true,
      index: true,
    },

    district: {
      type: String,
      default: "",
      index: true,
    },

    municipality: {
      type: String,
      default: "",
      index: true,
    },

    city: {
      type: String,
      required: true,
      index: true,
    },

    area: {
      type: String,
      required: true,
      index: true,
    },

    postalCode: {
      type: String,
      default: "",
    },

    latitude: {
      type: Number,
      default: null,
    },

    longitude: {
      type: Number,
      default: null,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

locationSchema.index({
  region: 1,
  city: 1,
  area: 1,
});

module.exports = mongoose.model("Location", locationSchema);