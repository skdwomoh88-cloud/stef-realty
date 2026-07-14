const User = require("../models/User");

// Get all users
const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// Update a user's role
const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (req.user.id === user._id.toString()) {
  return res.status(400).json({
    message: "You cannot change your own role.",
  });
}

    user.role = role;

    await user.save();

    res.json({
      message: "User role updated successfully.",
      user,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Prevent disabling your own account
    if (req.user.id === user._id.toString()) {
      return res.status(400).json({
        message: "You cannot deactivate your own account.",
      });
    }

    user.isActive = !user.isActive;

    await user.save();

    res.json({
      message: "User status updated successfully.",
      user,
    });

  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

module.exports = {
  getUsers,
  updateUserRole,
  toggleUserStatus,
};