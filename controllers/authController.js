const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const { getPermissionsForRole } = require("../utils/rbac");
const { isInternalStaffRole } = require("../utils/rbac");
const organizationService = require("../services/organizationService");
const passwordResetService = require("../services/passwordResetService");
const {
  findUserForLogin,
  findEquivalentRegisteredUser,
} = require("../utils/emailIdentity");

const issueAuthToken = (user) => jwt.sign(
  { id: user._id, role: user.role, version: Number(user.authVersion || 0) },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
);

const authUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
});

// Register User
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await findEquivalentRegisteredUser(email);

    if (userExists) {
      return res.status(409).json({
        success: false,
        error: {
          code: "EMAIL_IN_USE",
          message: "User already exists",
        },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      data: {
        token: issueAuthToken(user),
        user: authUser(user),
      },
    });

  } catch (error) {
    throw error;
  }
};

// Login User
const loginUser = async (req, res) => {
  try {

    const { email, password } = req.body;

    const user = await findUserForLogin(email);

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({
        success: false,
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    const token = issueAuthToken(user);

    res.json({
      success: true,
      data: {
        token,
        user: authUser(user),
      },
    });

  } catch (error) {
    throw error;
  }
};

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select("_id name email role isActive createdAt updatedAt");

  if (!user || !user.isActive) {
    throw new AppError("User account is unavailable.", 401, "UNAUTHORIZED");
  }

  const safeUser = typeof user.toObject === "function" ? user.toObject() : user;
  const employeeProfile = isInternalStaffRole(user.role)
    ? await organizationService.getEmployeeProfileForUser(user._id)
    : null;
  const organization = employeeProfile ? {
    department: employeeProfile.department ? {
      _id: employeeProfile.department._id,
      code: employeeProfile.department.code,
      name: employeeProfile.department.name,
    } : undefined,
    employee: {
      employeeNumber: employeeProfile.employeeNumber,
      jobTitle: employeeProfile.jobTitle,
      employmentStatus: employeeProfile.employmentStatus,
    },
  } : {};
  res.status(200).json({
    success: true,
    data: {
      ...safeUser,
      permissions: getPermissionsForRole(user.role),
      ...organization,
    },
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await passwordResetService.requestPasswordReset({ email: req.body.email, request: req });
  res.status(200).json({ success: true, message: result.message });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await passwordResetService.resetPassword({ token: req.body.token, newPassword: req.body.newPassword, request: req });
  res.status(200).json({ success: true, message: result.message });
});

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser,
  forgotPassword,
  resetPassword,
};
