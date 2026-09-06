const { LEGACY_ROLES } = require("./roleCatalogue");

// Compatibility adapter for existing routes and service ownership checks.
const ROLES = { ...LEGACY_ROLES };

module.exports = ROLES;
