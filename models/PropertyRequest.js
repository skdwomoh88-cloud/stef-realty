const mongoose = require("mongoose");
const PROPERTY_REQUEST_STATUS = require("../constants/propertyRequestStatus");
const PRIORITIES = require("../constants/priorities");
const PROPERTY_TYPES = require("../constants/propertyTypes");

const propertyRequestSchema = new mongoose.Schema({
  requestNumber: { type: String, required: true, unique: true },
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
  preferredContactMethod: { type: String, enum: ["Email", "Phone", "WhatsApp"], required: true },
  listingType: { type: String, enum: ["Sale", "Rent"], required: true },
  category: { type: String, enum: ["Residential", "Commercial"], required: true },
  propertyType: { type: String, enum: PROPERTY_TYPES, required: true },
  preferredRegion: { type: String, default: "", trim: true },
  preferredCity: { type: String, default: "", trim: true },
  preferredArea: { type: String, default: "", trim: true },
  minBudget: { type: Number, min: 0, default: null },
  maxBudget: { type: Number, min: 0, default: null },
  currency: { type: String, trim: true, uppercase: true, required: true },
  bedrooms: { type: Number, min: 0, default: null },
  bathrooms: { type: Number, min: 0, default: null },
  timeframe: { type: String, default: "", trim: true },
  requirements: { type: String, default: "", trim: true },
  status: { type: String, enum: Object.values(PROPERTY_REQUEST_STATUS), default: PROPERTY_REQUEST_STATUS.NEW },
  priority: { type: String, enum: Object.values(PRIORITIES), default: PRIORITIES.MEDIUM },
  assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  assignedAt: { type: Date, default: null },
  internalNotes: { type: String, default: "", trim: true },
  nextFollowUpAt: { type: Date, default: null },
}, { timestamps: true });

propertyRequestSchema.index({ assignedAgent: 1, status: 1 });
propertyRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PropertyRequest", propertyRequestSchema);
