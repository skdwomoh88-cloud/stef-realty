const { body, param, query } = require("express-validator");
const EMPLOYMENT_STATUS = require("../constants/employmentStatus");
const EMPLOYMENT_TYPE = require("../constants/employmentType");

const departmentId = [param("id").isMongoId().withMessage("Invalid Department ID")];
const departmentList = [query("active").optional().isBoolean().toBoolean().withMessage("Active must be a boolean")];
const departmentFields = [
  body("code").optional().trim().matches(/^[A-Za-z][A-Za-z0-9_]*$/).withMessage("Invalid Department code").customSanitizer((value) => value.toUpperCase()),
  body("name").optional().trim().isLength({ min: 2, max: 120 }).withMessage("Invalid Department name"),
  body("parentDepartment").optional({ nullable: true }).isMongoId().withMessage("Invalid parent Department ID"),
  body("manager").optional({ nullable: true }).isMongoId().withMessage("Invalid manager User ID"),
  body("active").optional().isBoolean().toBoolean().withMessage("Active must be a boolean"),
];
const createDepartment = [
  body("code").trim().matches(/^[A-Za-z][A-Za-z0-9_]*$/).customSanitizer((value) => value.toUpperCase()).withMessage("Invalid Department code"),
  body("name").trim().isLength({ min: 2, max: 120 }).withMessage("Invalid Department name"),
  ...departmentFields.slice(2),
];
const updateDepartment = [...departmentId, ...departmentFields];

const employeeId = [param("id").isMongoId().withMessage("Invalid Employee ID")];
const onlyFields = (...allowed) => body().custom((value, { req }) => {
  const unexpected = Object.keys(req.body || {}).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`Unexpected field: ${unexpected[0]}`);
  return true;
});
const mutableEmployeeFields = ["department", "jobTitle", "reportsTo", "employmentType", "startDate", "endDate", "employmentStatus"];
const rejectClientEmployeeNumber = body("employeeNumber")
  .not()
  .exists()
  .withMessage("Employee number is generated automatically and cannot be supplied");
const employeeFields = [
  body("department").optional().isMongoId().withMessage("Invalid Department ID"),
  body("jobTitle").optional().trim().isLength({ min: 2, max: 120 }).withMessage("Invalid job title"),
  body("reportsTo").optional({ nullable: true }).isMongoId().withMessage("Invalid reporting manager ID"),
  body("employmentType").optional().isIn(Object.values(EMPLOYMENT_TYPE)).withMessage("Invalid employment type"),
  body("startDate").optional().isISO8601().withMessage("Invalid start date"),
  body("endDate").optional({ nullable: true }).isISO8601().withMessage("Invalid end date"),
  body("employmentStatus").optional().isIn(Object.values(EMPLOYMENT_STATUS)).withMessage("Invalid employment status"),
];
const createEmployee = [
  rejectClientEmployeeNumber,
  body("user").isMongoId().withMessage("Invalid User ID"),
  body("department").isMongoId().withMessage("Invalid Department ID"),
  body("jobTitle").trim().isLength({ min: 2, max: 120 }).withMessage("Invalid job title"),
  body("employmentType").isIn(Object.values(EMPLOYMENT_TYPE)).withMessage("Invalid employment type"),
  body("startDate").isISO8601().withMessage("Invalid start date"),
  body("reportsTo").optional({ nullable: true }).isMongoId().withMessage("Invalid reporting manager ID"),
  body("endDate").optional({ nullable: true }).isISO8601().withMessage("Invalid end date"),
  body("employmentStatus").optional().isIn(Object.values(EMPLOYMENT_STATUS)).withMessage("Invalid employment status"),
  onlyFields("user", "employeeNumber", ...mutableEmployeeFields),
];
const updateEmployee = [...employeeId, rejectClientEmployeeNumber, ...employeeFields, onlyFields("employeeNumber", ...mutableEmployeeFields), body().custom((value, { req }) => {
  if (!Object.keys(req.body || {}).length) throw new Error("At least one EmployeeProfile field is required");
  return true;
})];
const employeeList = [
  query("page").optional().isInt({ min: 1 }).toInt(), query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("department").optional().isMongoId(), query("employmentStatus").optional().isIn(Object.values(EMPLOYMENT_STATUS)),
  query("employmentType").optional().isIn(Object.values(EMPLOYMENT_TYPE)), query("search").optional().trim().isLength({ min: 1, max: 100 }),
];

module.exports = { departmentId, departmentList, createDepartment, updateDepartment, employeeId, createEmployee, updateEmployee, employeeList };
