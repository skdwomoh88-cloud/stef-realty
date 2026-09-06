const express = require("express");
const controller = require("../controllers/organizationController");
const validator = require("../validators/organizationValidator");
const validate = require("../middleware/validationMiddleware");
const { protect } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../constants/permissions");

const router = express.Router();
router.use(protect);

const requireReportingPermissionWhenPresent = (req, res, next) => {
  if (!Object.prototype.hasOwnProperty.call(req.body || {}, "reportsTo")) return next();
  return requirePermission(PERMISSIONS.REPORTING_LINE_MANAGE)(req, res, next);
};

router.get("/departments", requirePermission(PERMISSIONS.DEPARTMENT_VIEW), validator.departmentList, validate, controller.listDepartments);
router.get("/departments/:id", requirePermission(PERMISSIONS.DEPARTMENT_VIEW), validator.departmentId, validate, controller.getDepartment);
router.post("/departments", requirePermission(PERMISSIONS.DEPARTMENT_MANAGE), validator.createDepartment, validate, controller.createDepartment);
router.put("/departments/:id", requirePermission(PERMISSIONS.DEPARTMENT_MANAGE), validator.updateDepartment, validate, controller.updateDepartment);

router.get("/employees", requirePermission(PERMISSIONS.EMPLOYEE_VIEW), validator.employeeList, validate, controller.listEmployees);
router.get("/employees/:id", requirePermission(PERMISSIONS.EMPLOYEE_VIEW), validator.employeeId, validate, controller.getEmployee);
router.post("/employees", requirePermission(PERMISSIONS.EMPLOYEE_MANAGE), requireReportingPermissionWhenPresent, validator.createEmployee, validate, controller.createEmployee);
router.put("/employees/:id", requirePermission(PERMISSIONS.EMPLOYEE_MANAGE), requireReportingPermissionWhenPresent, validator.updateEmployee, validate, controller.updateEmployee);

module.exports = router;
