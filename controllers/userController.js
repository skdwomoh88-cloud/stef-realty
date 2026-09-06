const User = require("../models/User");
const EmployeeProfile = require("../models/EmployeeProfile");
const asyncHandler = require("../utils/asyncHandler");
const service = require("../services/userAdministrationService");

exports.getUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 });
  const profiles = await EmployeeProfile.find({ user: { $in: users.map((user) => user._id) } }).select("user employeeNumber").lean();
  const byUser = new Map(profiles.map((profile) => [String(profile.user), { _id: profile._id, employeeNumber: profile.employeeNumber }]));
  res.json(users.map((user) => ({ ...user.toJSON(), employeeProfile: byUser.get(String(user._id)) || null })));
});

exports.updateUserRole = asyncHandler(async (req, res) => {
  const user = await service.updateRole({ targetUserId: req.params.id, requestedRole: req.body.role, actor: req.user, request: req });
  res.json({ message: "User role updated successfully.", user });
});

exports.updateUserStatus = asyncHandler(async (req, res) => {
  const user = await service.updateStatus({ targetUserId: req.params.id, isActive: req.body.isActive, actor: req.user, request: req });
  res.json({ message: "User status updated successfully.", user });
});

exports.getRoleDirectory = asyncHandler(async (req, res) => {
  res.json({ success: true, data: service.getRoleDirectory(req.user) });
});
