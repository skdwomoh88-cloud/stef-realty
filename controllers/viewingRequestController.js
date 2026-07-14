const ViewingRequest = require("../models/ViewingRequest");

const {
  createNotification,
} = require("../services/notificationService");

// Create a viewing request
const createViewingRequest = async (req, res) => {
  try {
    const viewingRequest = await ViewingRequest.create(req.body);

    res.status(201).json(viewingRequest);

  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

// Get all viewing requests
const getViewingRequests = async (req, res) => {
  try {
    const requests = await ViewingRequest.find()
      .populate("property", "title location price")
      .sort({ createdAt: -1 });

    res.json(requests);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Get viewing requests for the logged-in user
const getMyViewingRequests = async (req, res) => {
  try {

    // Admin can see everything
    if (req.user.role === "Admin") {

      const requests = await ViewingRequest.find()
        .populate("property", "title location price")
        .populate("assignedAgent", "name email")
        .sort({ createdAt: -1 });

      return res.json(requests);
    }

    // Agent can only see assigned requests
    if (req.user.role === "Agent") {

      const requests = await ViewingRequest.find({
        assignedAgent: req.user._id,
      })
        .populate("property", "title location price")
        .populate("assignedAgent", "name email")
        .sort({ createdAt: -1 });

      return res.json(requests);
    }

    // Everyone else
    return res.status(403).json({
      message: "Access denied.",
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};

// Get a single viewing request
const getViewingRequestById = async (req, res) => {
  try {
    const request = await ViewingRequest.findById(req.params.id)
      .populate("property")
      .populate("assignedAgent", "name email");

    if (!request) {
      return res.status(404).json({
        message: "Viewing request not found.",
      });
    }

    // Admin can access every request
    if (req.user.role === "Admin") {
      return res.json(request);
    }

    // Agent can only access assigned requests
    if (req.user.role === "Agent") {

      if (
  request.assignedAgent &&
  request.assignedAgent._id &&
  request.assignedAgent._id.toString() === req.user._id.toString()
) {
  return res.json(request);
}

      return res.status(403).json({
        message: "Access denied.",
      });
    }

    return res.status(403).json({
      message: "Access denied.",
    });

  } catch (error) {

    res.status(500).json({
      message: error.message,
    });

  }
};

// Update viewing request status
// Update viewing request status
const updateViewingStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const request = await ViewingRequest.findById(req.params.id)
      .populate("assignedAgent");

    if (!request) {
      return res.status(404).json({
        message: "Viewing request not found.",
      });
    }

    // Admin can update any request
    if (req.user.role === "Admin") {
      request.status = status;

      await request.save();

      return res.json({
        message: "Viewing request updated successfully.",
        request,
      });
    }

    // Agent can update only assigned requests
    if (req.user.role === "Agent") {

      if (
        request.assignedAgent &&
        request.assignedAgent._id.toString() === req.user._id.toString()
      ) {
        request.status = status;

        await request.save();

        return res.json({
          message: "Viewing request updated successfully.",
          request,
        });
      }

      return res.status(403).json({
        message: "You are not assigned to this viewing request.",
      });
    }

    return res.status(403).json({
      message: "Access denied.",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: error.message,
    });

  }
};

// Update CRM information
const updateViewingRequest = async (req, res) => {
  try {
    const {
      assignedAgent,
      priority,
      nextFollowUp,
      internalNotes,
    } = req.body;

    const request = await ViewingRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        message: "Viewing request not found.",
      });
    }

    const previousAgent = request.assignedAgent?.toString();

    request.assignedAgent = assignedAgent;
    request.priority = priority;
    request.nextFollowUp = nextFollowUp;
    request.internalNotes = internalNotes;

    await request.save();

    if (
  assignedAgent &&
  assignedAgent !== previousAgent
) {
  await createNotification({
    recipient: assignedAgent,
    title: "New Viewing Request Assigned",
    message: `You have been assigned to ${request.fullName}'s viewing request.`,
    type: "ViewingRequest",
    link: `/agent/viewing-requests/${request._id}`,
    createdBy: req.user._id,
  });
}

    res.json({
      message: "Viewing request updated successfully.",
      request,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  createViewingRequest,
  getViewingRequests,
  getMyViewingRequests,
  getViewingRequestById,
  updateViewingStatus,
  updateViewingRequest,
};