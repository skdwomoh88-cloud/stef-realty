const mongoose = require("mongoose");
const User = require("../models/User");
const AppError = require("./AppError");
const { ROLES } = require("../constants/roleCatalogue");
const { isRole } = require("./rbac");

const requireActiveAgent = async (agentId) => {
  if (!mongoose.isValidObjectId(agentId)) {
    throw new AppError(
      "Assigned agent must be an active Agent user.",
      400,
      "INVALID_ASSIGNED_AGENT"
    );
  }

  const agent = await User.findById(agentId).select("_id role isActive");

  if (!agent || !isRole(agent.role, ROLES.AGENT) || !agent.isActive) {
    throw new AppError(
      "Assigned agent must be an active Agent user.",
      400,
      "INVALID_ASSIGNED_AGENT"
    );
  }

  return agent;
};

module.exports = {
  requireActiveAgent,
};
