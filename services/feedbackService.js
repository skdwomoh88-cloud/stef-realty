const mongoose = require("mongoose");
const Feedback = require("../models/Feedback");
const ViewingRequest = require("../models/ViewingRequest");
const AppError = require("../utils/AppError");
const FEEDBACK_STATUS = require("../constants/feedbackStatus");
const REFERENCE_PREFIXES = require("../constants/referencePrefixes");
const { generateReferenceNumber } = require("../utils/referenceNumberGenerator");
const { feedbackTokensMatch } = require("../utils/feedbackToken");
const notificationService = require("./notificationService");
const { findActivePlatformAdministrators } = require("./adminRecipientService");

const populateFeedback = (query) => query
  .populate({
    path: "viewingRequest",
    select: "fullName email phone preferredDate preferredTime status property properties",
    populate: [
      { path: "property", select: "title location price currency" },
      { path: "properties", select: "title location price currency" },
    ],
  })
  .populate("property", "title")
  .populate("agent", "name email")
  .populate("reviewedBy", "name email");

const createFeedback = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const viewingRequest = await ViewingRequest.findById(data.viewingRequest)
      .select("+feedbackTokenHash +feedbackTokenExpiresAt +feedbackTokenUsedAt")
      .session(session);

    if (!viewingRequest) {
      throw new AppError("Viewing request not found.", 404, "VIEWING_REQUEST_NOT_FOUND");
    }
    if (viewingRequest.status !== "Completed") {
      throw new AppError("Feedback is available only after a completed viewing.", 400, "VIEWING_NOT_COMPLETED");
    }
    if (!viewingRequest.assignedAgent) {
      throw new AppError("Viewing request has no assigned Agent.", 400, "VIEWING_AGENT_MISSING");
    }
    const viewingProperties = viewingRequest.properties?.length
      ? viewingRequest.properties
      : viewingRequest.property ? [viewingRequest.property] : [];
    if (viewingProperties.length === 0) {
      throw new AppError("Viewing request has no Property.", 400, "VIEWING_PROPERTY_MISSING");
    }
    const canonicalProperty = viewingRequest.property || viewingProperties[0];

    const existing = await Feedback.findOne({ viewingRequest: viewingRequest._id }).session(session);
    if (existing) {
      throw new AppError("Feedback has already been submitted.", 409, "FEEDBACK_ALREADY_SUBMITTED");
    }
    if (viewingRequest.feedbackTokenUsedAt) {
      throw new AppError("Feedback token has already been used.", 409, "FEEDBACK_TOKEN_USED");
    }
    if (!viewingRequest.feedbackTokenHash ||
        !feedbackTokensMatch(data.feedbackToken, viewingRequest.feedbackTokenHash)) {
      throw new AppError("Feedback token is invalid.", 401, "FEEDBACK_TOKEN_INVALID");
    }
    if (!viewingRequest.feedbackTokenExpiresAt ||
        viewingRequest.feedbackTokenExpiresAt.getTime() <= Date.now()) {
      throw new AppError("Feedback token has expired.", 410, "FEEDBACK_TOKEN_EXPIRED");
    }

    const feedbackNumber = await generateReferenceNumber(
      REFERENCE_PREFIXES.FEEDBACK,
      "feedback"
    );
    const [feedback] = await Feedback.create([{
      feedbackNumber,
      viewingRequest: viewingRequest._id,
      property: canonicalProperty,
      agent: viewingRequest.assignedAgent,
      clientName: viewingRequest.fullName,
      clientEmail: viewingRequest.email,
      rating: data.rating,
      review: data.review,
      professionalismRating: data.professionalismRating,
      communicationRating: data.communicationRating,
      punctualityRating: data.punctualityRating,
      knowledgeRating: data.knowledgeRating,
      wouldRecommend: data.wouldRecommend,
      status: FEEDBACK_STATUS.NEW,
    }], { session });

    viewingRequest.feedbackTokenUsedAt = new Date();
    await viewingRequest.save({ session });

    const admins = await findActivePlatformAdministrators({ session });
    for (const admin of admins) {
      await notificationService.createNotification({
        recipient: admin._id,
        type: "Feedback",
        title: "New Agent Feedback",
        message: `New feedback ${feedback.feedbackNumber} was submitted after a completed viewing.`,
        relatedFeedback: feedback._id,
        relatedViewingRequest: viewingRequest._id,
        relatedProperty: canonicalProperty,
      }, { session });
    }

    const result = await populateFeedback(Feedback.findById(feedback._id).session(session));
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    const duplicateViewing = error.code === 11000 &&
      (error.keyPattern?.viewingRequest || error.keyValue?.viewingRequest);
    if (duplicateViewing) {
      throw new AppError("Feedback has already been submitted.", 409, "FEEDBACK_ALREADY_SUBMITTED");
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const listFeedback = async ({
  page = 1, limit = 20, agent, property, rating, status,
  dateFrom, dateTo, sortBy = "createdAt", sortOrder = "desc",
} = {}) => {
  page = Math.max(Number(page) || 1, 1);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const filter = {};
  if (agent) filter.agent = agent;
  if (property) filter.property = property;
  if (rating !== undefined) filter.rating = Number(rating);
  if (status) filter.status = status;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }
  const skip = (page - 1) * limit;
  const direction = sortOrder === "asc" ? 1 : -1;
  const [feedback, total] = await Promise.all([
    populateFeedback(Feedback.find(filter))
      .sort({ [sortBy]: direction }).skip(skip).limit(limit),
    Feedback.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return {
    feedback,
    pagination: {
      total, page, limit, totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const getFeedbackById = async (id) => {
  const feedback = await populateFeedback(Feedback.findById(id));
  if (!feedback) throw new AppError("Feedback not found.", 404, "FEEDBACK_NOT_FOUND");
  return feedback;
};

const updateFeedbackStatus = async (id, status, currentUser) => {
  const feedback = await Feedback.findById(id);
  if (!feedback) throw new AppError("Feedback not found.", 404, "FEEDBACK_NOT_FOUND");
  feedback.status = status;
  if (status === FEEDBACK_STATUS.REVIEWED) {
    feedback.reviewedBy = currentUser._id;
    feedback.reviewedAt = new Date();
  } else if (status === FEEDBACK_STATUS.NEW) {
    feedback.reviewedBy = null;
    feedback.reviewedAt = null;
  }
  await feedback.save();
  return populateFeedback(Feedback.findById(feedback._id));
};

const updateFeedback = async (id, data) => {
  const feedback = await Feedback.findById(id);
  if (!feedback) throw new AppError("Feedback not found.", 404, "FEEDBACK_NOT_FOUND");
  if (data.adminNotes !== undefined) feedback.adminNotes = data.adminNotes;
  await feedback.save();
  return populateFeedback(Feedback.findById(feedback._id));
};

const archiveFeedback = async (id) => {
  const feedback = await Feedback.findById(id);
  if (!feedback) throw new AppError("Feedback not found.", 404, "FEEDBACK_NOT_FOUND");
  feedback.status = FEEDBACK_STATUS.ARCHIVED;
  await feedback.save();
  return feedback;
};

const getAgentSummary = async (agentId) => {
  const [summary] = await Feedback.aggregate([
    { $match: { agent: new mongoose.Types.ObjectId(agentId), status: { $ne: FEEDBACK_STATUS.ARCHIVED } } },
    { $group: {
      _id: null,
      totalFeedback: { $sum: 1 },
      averageRating: { $avg: "$rating" },
      averageProfessionalism: { $avg: "$professionalismRating" },
      averageCommunication: { $avg: "$communicationRating" },
      averagePunctuality: { $avg: "$punctualityRating" },
      averageKnowledge: { $avg: "$knowledgeRating" },
      recommendationPercentage: {
        $avg: {
          $cond: [
            { $eq: ["$wouldRecommend", true] },
            100,
            { $cond: [{ $eq: ["$wouldRecommend", false] }, 0, null] },
          ],
        },
      },
    } },
    { $project: { _id: 0 } },
  ]);
  return summary || {
    totalFeedback: 0,
    averageRating: null,
    averageProfessionalism: null,
    averageCommunication: null,
    averagePunctuality: null,
    averageKnowledge: null,
    recommendationPercentage: null,
  };
};

module.exports = {
  createFeedback,
  listFeedback,
  getFeedbackById,
  updateFeedbackStatus,
  updateFeedback,
  archiveFeedback,
  getAgentSummary,
};
