const Notification = require("../models/Notification");

// Get notifications for the logged-in user
const getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(notifications);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found.",
      });
    }

    // Users can only mark their own notifications
    if (
      notification.recipient.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        message: "Access denied.",
      });
    }

    notification.isRead = true;

    await notification.save();

    res.json({
      message: "Notification marked as read.",
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getMyNotifications,
  markAsRead,
};