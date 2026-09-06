const { body, param } = require("express-validator");
const { USER_ROLE_VALUES } = require("../constants/roleCatalogue");

const onlyFields = (...allowed) => body().custom((value, { req }) => {
  const unexpected = Object.keys(req.body || {}).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`Unexpected field: ${unexpected[0]}`);
  return true;
});

const updateUserRoleValidator = [
  param("id").isMongoId().withMessage("Invalid user ID"),
  body("role").exists().isString().isIn(USER_ROLE_VALUES).withMessage("Invalid user role"),
  onlyFields("role"),
];

const updateUserStatusValidator = [
  param("id").isMongoId().withMessage("Invalid user ID"),
  body("isActive").exists().isBoolean({ strict: true }).withMessage("isActive must be a boolean"),
  onlyFields("isActive"),
];

module.exports = { updateUserRoleValidator, updateUserStatusValidator };
