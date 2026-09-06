const mongoose = require("mongoose");
const DOCUMENT_CATEGORIES = require("../constants/documentCategories");

const DocumentSchema = new mongoose.Schema(
  {
    documentNumber: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    category: {
      type: String,
      enum: Object.values(DOCUMENT_CATEGORIES),
      required: true,
    },
    originalFileName: { type: String, required: true },
    storedFileName: { type: String, required: true, select: false },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true, min: 1 },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    relatedProperty: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null },
    relatedInquiry: { type: mongoose.Schema.Types.ObjectId, ref: "Inquiry", default: null },
    relatedViewingRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ViewingRequest", default: null },
    relatedOffer: { type: mongoose.Schema.Types.ObjectId, ref: "Offer", default: null },
    relatedDeal: { type: mongoose.Schema.Types.ObjectId, ref: "Deal", default: null },
    relatedTask: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
    relatedCase: { type: mongoose.Schema.Types.ObjectId, ref: "Case", default: null },
    relatedInspection: { type: mongoose.Schema.Types.ObjectId, ref: "Inspection", default: null },
    relatedListingDraft: { type: mongoose.Schema.Types.ObjectId, ref: "ListingDraft", default: null },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

DocumentSchema.index({ uploadedBy: 1, createdAt: -1 });
DocumentSchema.index({ category: 1 });
DocumentSchema.index({ relatedProperty: 1 });
DocumentSchema.index({ relatedDeal: 1 });
DocumentSchema.index({ relatedTask: 1 });
DocumentSchema.index({ isArchived: 1 });

module.exports = mongoose.model("Document", DocumentSchema);
