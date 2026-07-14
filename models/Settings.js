const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      default: "Stef Realty",
    },

    companyEmail: {
      type: String,
      default: "",
    },

    companyPhone: {
      type: String,
      default: "",
    },

    companyAddress: {
      type: String,
      default: "",
    },

    logo: {
      type: String,
      default: "",
    },

    heroTitle: {
      type: String,
      default: "Find Your Next Property with Confidence",
    },

    heroSubtitle: {
      type: String,
      default: "Verified Properties. Trusted Service.",
    },

    heroDescription: {
      type: String,
      default:
        "Buy, rent, sell, or let Stef Realty manage your property.",
    },

    defaultCurrency: {
      type: String,
      default: "GHS",
    },

    defaultCountry: {
      type: String,
      default: "Ghana",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Settings",
  settingsSchema
);