const PropertySubmission = require("../models/PropertySubmission");
const Property = require("../models/Property");

// Create a new submission
const createSubmission = async (req, res) => {
  try {
    const submission = await PropertySubmission.create(req.body);

    res.status(201).json(submission);
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

// Get all submissions
const getSubmissions = async (req, res) => {
  try {
    const submissions = await PropertySubmission.find().sort({
      createdAt: -1,
    });

    res.json(submissions);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get one submission
const getSubmissionById = async (req, res) => {
  try {
    const submission = await PropertySubmission.findById(req.params.id);

    if (!submission) {
      return res.status(404).json({
        message: "Submission not found",
      });
    }

    res.json(submission);
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Approve submission
const approveSubmission = async (req, res) => {
  try {
    const submission = await PropertySubmission.findById(
      req.params.id
    );

    if (!submission) {
      return res.status(404).json({
        message: "Submission not found",
      });
    }

    if (submission.status === "Approved") {
      return res.status(400).json({
        message: "Submission has already been approved.",
      });
    }

    const property = await Property.create({
      title: submission.title,
      description: submission.description,
      price: submission.askingPrice,
      location: submission.area,
      region: submission.region,
      city: submission.city,
      area: submission.area,
      category: submission.category,
      propertyType: submission.propertyType,
      listingType: submission.listingType,
      images: submission.images,
      status: "Available",
    });

    submission.status = "Approved";
    submission.approvedProperty = property._id;

    await submission.save();

    res.json({
      message: "Submission approved successfully.",
      property,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Reject submission
const rejectSubmission = async (req, res) => {
  try {
    const submission = await PropertySubmission.findById(
      req.params.id
    );

    if (!submission) {
      return res.status(404).json({
        message: "Submission not found",
      });
    }

    submission.status = "Rejected";

    await submission.save();

    res.json({
      message: "Submission rejected.",
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createSubmission,
  getSubmissions,
  getSubmissionById,
  approveSubmission,
  rejectSubmission,
};