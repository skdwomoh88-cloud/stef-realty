const mongoose = require("mongoose");

const PropertySchema = new mongoose.Schema({
title: {
    type: String,
    required: true,
    trim: true
},

description: {
    type: String,
    required: true,
    trim: true
},

price: {
    type: Number,
    required: true,
    min: 0
},

currency: {
    type: String,
    enum: ["GHS", "USD", "EUR", "GBP"],
    default: "GHS"
},

country: {
  type: String,
  required: true,
  trim: true
},

location: {
  type: String,
  required: true
},

category: {
  type: String,
  enum: ["Residential", "Commercial"],
  required: true
},

propertyType: {
  type: String,
  enum: [
    "House",
    "Apartment",
    "Townhouse",
    "Villa",
    "Hostel",
    "Hotel",
    "Office",
    "Shop",
    "Warehouse",
    "Land"
  ],
  required: true
},

bedrooms: {
  type: Number,
  required: true,
  min: 0
},

bathrooms: {
  type: Number,
  required: true,
  min: 0
},

kitchens: {
  type: Number,
  required: true,
  min: 0
},

garageSpaces: {
  type: Number,
  default: 0,
  min: 0
},

floorArea: {
  type: Number,
  required: true,
  min: 0
},

landSize: {
  type: Number,
  required: true,
  min: 0
},

yearBuilt: {
  type: Number
},

features: [
  {
    type: String
  }
],

images: [
  {
    type: String
  }
],

status: {
  type: String,
  enum: ["Available", "Pending", "Sold", "Rented"],
  default: "Available"
},

featured: {
  type: Boolean,
  default: false
},

listingType: {
  type: String,
  enum: ["Sale", "Rent"],
  required: true
},

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Property", PropertySchema);