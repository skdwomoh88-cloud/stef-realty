const mongoose = require("mongoose");
const Department = require("../models/Department");
const EmployeeProfile = require("../models/EmployeeProfile");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const { ROLES } = require("../constants/roleCatalogue");
const { normalizeRole } = require("../utils/rbac");
const auditService = require("./auditService");
const employeeProfileService = require("./employeeProfileBootstrapService");

const employeePopulation = (query) => query
  .populate("user", "name email role isActive")
  .populate("department", "code name active")
  .populate({ path: "reportsTo", select: "user employeeNumber jobTitle employmentStatus", populate: { path: "user", select: "name email role isActive" } });

const departmentPopulation = (query) => query
  .populate("parentDepartment", "code name active")
  .populate("manager", "name email role isActive");

const getEmployeeProfileForUser = (userId) => employeePopulation(EmployeeProfile.findOne({ user: userId }));

const getDepartmentForUser = async (userId) => {
  const profile = await EmployeeProfile.findOne({ user: userId }).populate("department", "code name active");
  return profile?.department || null;
};

const getDirectReports = async (managerUserId) => {
  const manager = await EmployeeProfile.findOne({ user: managerUserId }).select("_id");
  if (!manager) return [];
  return employeePopulation(EmployeeProfile.find({ reportsTo: manager._id }));
};

const getManagedUserIds = async (managerUserId, { maxDepth = 20, maxEmployees = 10000 } = {}) => {
  const manager = await EmployeeProfile.findOne({ user: managerUserId }).select("_id user");
  if (!manager) return [];
  const managedUsers = [];
  let currentProfileIds = [manager._id];
  const visited = new Set([manager._id.toString()]);
  for (let depth = 0; currentProfileIds.length && depth < maxDepth; depth += 1) {
    const reports = await EmployeeProfile.find({ reportsTo: { $in: currentProfileIds } }).select("_id user");
    currentProfileIds = [];
    for (const report of reports) {
      const key = report._id.toString();
      if (visited.has(key)) continue;
      visited.add(key);
      managedUsers.push(report.user);
      currentProfileIds.push(report._id);
      if (managedUsers.length >= maxEmployees) return managedUsers;
    }
  }
  return managedUsers;
};

const isManagerOf = async (managerUserId, employeeUserId) => {
  if (!managerUserId || !employeeUserId || managerUserId.toString() === employeeUserId.toString()) return false;
  const managed = await getManagedUserIds(managerUserId);
  return managed.some((id) => id.toString() === employeeUserId.toString());
};

const listDepartments = async ({ active } = {}) => {
  const filter = {};
  if (active !== undefined) filter.active = active;
  return departmentPopulation(Department.find(filter)).sort({ code: 1 });
};

const getDepartmentById = async (id) => {
  const department = await departmentPopulation(Department.findById(id));
  if (!department) throw new AppError("Department not found.", 404, "DEPARTMENT_NOT_FOUND");
  return department;
};

const createDepartment = async (data, context) => {
  const department = await Department.create({
    code: data.code, name: data.name, parentDepartment: data.parentDepartment || null,
    manager: data.manager || null, active: data.active === undefined ? true : data.active,
  });
  if (context) await auditService.recordAuditEventSafely({ ...context, action: "DEPARTMENT_CREATED", entityType: "Department", entityId: department._id, entityReference: department.code, after: { code: department.code, name: department.name, parentDepartment: department.parentDepartment, manager: department.manager, active: department.active } });
  return department;
};

const updateDepartment = async (id, data, context) => {
  const department = await Department.findById(id);
  if (!department) throw new AppError("Department not found.", 404, "DEPARTMENT_NOT_FOUND");
  const before = { code: department.code, name: department.name, parentDepartment: department.parentDepartment, manager: department.manager, active: department.active };
  for (const field of ["code", "name", "parentDepartment", "manager", "active"]) {
    if (data[field] !== undefined) department[field] = data[field] || (["parentDepartment", "manager"].includes(field) ? null : data[field]);
  }
  await department.save();
  if (context) await auditService.recordAuditEventSafely({ ...context, action: data.manager !== undefined && String(before.manager || "") !== String(department.manager || "") ? "DEPARTMENT_MANAGER_CHANGED" : "DEPARTMENT_UPDATED", entityType: "Department", entityId: department._id, entityReference: department.code, before, after: { code: department.code, name: department.name, parentDepartment: department.parentDepartment, manager: department.manager, active: department.active } });
  return getDepartmentById(department._id);
};

const companyWideDirectoryRoles = new Set([ROLES.SUPER_ADMIN, ROLES.GENERAL_MANAGER, ROLES.HR_MANAGER, ROLES.HR_OFFICER, ROLES.AUDITOR]);
const teamManagerRoles = new Set([ROLES.OPERATIONS_MANAGER, ROLES.CUSTOMER_RELATIONS_MANAGER, ROLES.FINANCE_MANAGER, ROLES.MARKETING_MANAGER]);

const employeeDirectoryFilter = async (currentUser) => {
  const role = normalizeRole(currentUser.role);
  if (companyWideDirectoryRoles.has(role)) return {};
  if (teamManagerRoles.has(role)) {
    const managedUserIds = await getManagedUserIds(currentUser._id);
    return { user: { $in: [currentUser._id, ...managedUserIds] } };
  }
  return { user: currentUser._id };
};

const listEmployees = async (query, currentUser) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = await employeeDirectoryFilter(currentUser);
  for (const field of ["department", "employmentStatus", "employmentType"]) {
    if (query[field] !== undefined) filter[field] = query[field];
  }
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matchingUsers = await User.find({ $or: [{ name: new RegExp(escaped, "i") }, { email: new RegExp(escaped, "i") }] }).select("_id");
    const matchingIds = matchingUsers.map((user) => user._id);
    if (filter.user?.$in) {
      const allowed = new Set(filter.user.$in.map(String));
      filter.user = { $in: matchingIds.filter((id) => allowed.has(String(id))) };
    } else filter.user = { $in: matchingIds };
  }
  const [employees, total] = await Promise.all([
    employeePopulation(EmployeeProfile.find(filter)).sort({ employeeNumber: 1 }).skip((page - 1) * limit).limit(limit),
    EmployeeProfile.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { employees, pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};

const getEmployeeById = async (id, currentUser) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Employee not found.", 404, "EMPLOYEE_NOT_FOUND");
  const filter = await employeeDirectoryFilter(currentUser);
  const employee = await employeePopulation(EmployeeProfile.findOne({ _id: id, ...filter }));
  if (!employee) throw new AppError("Employee not found.", 404, "EMPLOYEE_NOT_FOUND");
  return employee;
};

const createEmployee = async (data, context) => {
  const result = await employeeProfileService.createEmployeeProfileTransactional({
    actor: context?.actor,
    request: context?.request,
    userId: data.user,
    departmentId: data.department,
    profile: {
      jobTitle: data.jobTitle, reportsTo: data.reportsTo ?? null, employmentType: data.employmentType,
      startDate: data.startDate, endDate: data.endDate ?? null, employmentStatus: data.employmentStatus,
    },
  });
  return employeePopulation(EmployeeProfile.findById(result.employee._id));
};

const updateEmployee = async (id, data, context) => {
  const fields = ["department", "jobTitle", "reportsTo", "employmentType", "startDate", "endDate", "employmentStatus"];
  const session = await mongoose.startSession();
  let employeeId;
  try {
    await session.withTransaction(async () => {
      const actor = await User.findById(context?.actor?._id || context?.actor?.id).select("_id name email role isActive").session(session);
      if (!actor || actor.isActive !== true || normalizeRole(actor.role) !== ROLES.SUPER_ADMIN) {
        throw new AppError("Only an active Super Admin may update an EmployeeProfile.", 403, "EMPLOYEE_PROFILE_UPDATE_FORBIDDEN");
      }
      const employee = await EmployeeProfile.findById(id).session(session);
      if (!employee) throw new AppError("Employee not found.", 404, "EMPLOYEE_NOT_FOUND");
      const before = Object.fromEntries(fields.map((field) => [field, employee[field]]));
      for (const field of fields) {
        if (data[field] !== undefined) employee[field] = data[field] === "" && ["reportsTo", "endDate"].includes(field) ? null : data[field];
      }
      employee.$session(session);
      await employee.save({ session });
      const after = Object.fromEntries(fields.map((field) => [field, employee[field]]));
      const reportingChanged = data.reportsTo !== undefined && String(before.reportsTo || "") !== String(employee.reportsTo || "");
      await auditService.recordAuditEvent({
        actor, request: context.request, action: reportingChanged ? "REPORTING_LINE_CHANGED" : "EMPLOYEE_PROFILE_UPDATED",
        entityType: "EmployeeProfile", entityId: employee._id, entityReference: employee.employeeNumber,
        before, after, outcome: "SUCCESS", session,
      });
      employeeId = employee._id;
    });
    return employeePopulation(EmployeeProfile.findById(employeeId));
  } finally { await session.endSession(); }
};

module.exports = { getEmployeeProfileForUser, getDepartmentForUser, getDirectReports, getManagedUserIds, isManagerOf, listDepartments, getDepartmentById, createDepartment, updateDepartment, listEmployees, getEmployeeById, createEmployee, updateEmployee, employeeDirectoryFilter };
