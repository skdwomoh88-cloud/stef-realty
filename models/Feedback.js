const mongoose = require("mongoose");
const FEEDBACK_STATUS = require("../constants/feedbackStatus");

const FeedbackSchema = new mongoose.Schema(
  {
    feedbackNumber: { type: String, required: true, unique: true },
    viewingRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ViewingRequest",
      required: true,
      unique: true,
    },
    property: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    clientName: { type: String, required: true, trim: true },
    clientEmail: { type: String, required: true, trim: true, lowercase: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, default: "", trim: true },
    professionalismRating: { type: Number, min: 1, max: 5 },
    communicationRating: { type: Number, min: 1, max: 5 },
    punctualityRating: { type: Number, min: 1, max: 5 },
    knowledgeRating: { type: Number, min: 1, max: 5 },
    wouldRecommend: { type: Boolean, default: null },
    status: {
      type: String,
      enum: Object.values(FEEDBACK_STATUS),
      default: FEEDBACK_STATUS.NEW,
    },
    adminNotes: { type: String, default: "", trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

FeedbackSchema.index({ agent: 1, status: 1 });
FeedbackSchema.index({ property: 1 });
FeedbackSchema.index({ rating: 1 });
FeedbackSchema.index({ createdAt: 1 });

module.exports = mongoose.model("Feedback", FeedbackSchema);
