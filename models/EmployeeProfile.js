const mongoose = require("mongoose");
const User = require("./User");
const Department = require("./Department");
const EMPLOYMENT_STATUS = require("../constants/employmentStatus");
const EMPLOYMENT_TYPE = require("../constants/employmentType");
const { isInternalStaffRole } = require("../utils/rbac");

const employeeProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  employeeNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
  jobTitle: { type: String, required: true, trim: true },
  reportsTo: { type: mongoose.Schema.Types.ObjectId, ref: "EmployeeProfile", default: null },
  employmentType: { type: String, enum: Object.values(EMPLOYMENT_TYPE), required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, default: null },
  employmentStatus: { type: String, enum: Object.values(EMPLOYMENT_STATUS), default: EMPLOYMENT_STATUS.ACTIVE },
}, { timestamps: true });

employeeProfileSchema.index({ department: 1, employmentStatus: 1 });
employeeProfileSchema.index({ reportsTo: 1, employmentStatus: 1 });

employeeProfileSchema.pre("validate", async function validateOrganizationReferences() {
  const session = this.$session();
  const userQuery = this.user ? User.findById(this.user).select("role isActive") : null;
  if (session && userQuery) userQuery.session(session);
  const user = userQuery ? await userQuery : null;
  if (!user || !isInternalStaffRole(user.role)) {
    this.invalidate("user", "EmployeeProfile requires an internal staff User");
  } else if (this.employmentStatus === EMPLOYMENT_STATUS.ACTIVE && !user.isActive) {
    this.invalidate("user", "An active EmployeeProfile requires an active User");
  }

  const departmentQuery = this.department ? Department.findById(this.department).select("active") : null;
  if (session && departmentQuery) departmentQuery.session(session);
  const department = departmentQuery ? await departmentQuery : null;
  if (!department) {
    this.invalidate("department", "Department does not exist");
  } else if (this.employmentStatus === EMPLOYMENT_STATUS.ACTIVE && !department.active) {
    this.invalidate("department", "Active employees require an active Department");
  }

  if (this.reportsTo) {
    if (this._id && this.reportsTo.toString() === this._id.toString()) {
      this.invalidate("reportsTo", "An employee cannot report to themselves");
    } else {
      const visited = new Set([this._id?.toString()].filter(Boolean));
      let currentId = this.reportsTo;
      while (currentId) {
        const key = currentId.toString();
        if (visited.has(key)) {
          this.invalidate("reportsTo", "Reporting hierarchy cannot contain a cycle");
          break;
        }
        visited.add(key);
        const currentQuery = this.constructor.findById(currentId).select("reportsTo");
        if (session) currentQuery.session(session);
        const current = await currentQuery;
        if (!current) {
          this.invalidate("reportsTo", "Reporting manager does not exist");
          break;
        }
        currentId = current.reportsTo;
      }
    }
  }
});

module.exports = mongoose.model("EmployeeProfile", employeeProfileSchema);
