const EMPLOYMENT_STATUS = require("../constants/employmentStatus");

// Authentication remains governed only by User.isActive in Phase 2.
const canAccessSystem = (user) => Boolean(user?.isActive);

const getOffboardingRecommendation = (employeeProfile, user) => ({
  employmentStatus: employeeProfile?.employmentStatus || null,
  currentSystemAccess: canAccessSystem(user),
  reviewAccessDeactivation:
    employeeProfile?.employmentStatus === EMPLOYMENT_STATUS.TERMINATED && canAccessSystem(user),
});

module.exports = { canAccessSystem, getOffboardingRecommendation };
