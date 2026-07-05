const mongoose = require("mongoose");

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
      type: String,
      required: true,
      trim: true,
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
      default: "",
    },

    category: {
      type: String,
      enum: ["Residential", "Commercial"],
      required: true,
    },

    propertyType: {
      type: String,
      enum: [
        "House",
        "Apartment",
        "Townhouse",
        "Villa",
        "Land",
        "Office",
        "Shop",
        "Warehouse",
        "Hotel",
      ],
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

    status: {
      type: String,
      enum: [
        "Available",
        "Sold",
        "Rented",
        "Pending",
      ],
      default: "Available",
    },

    images: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Property", propertySchema);