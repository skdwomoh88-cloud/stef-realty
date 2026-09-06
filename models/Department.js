const mongoose = require("mongoose");
const User = require("./User");
const { isInternalStaffRole } = require("../utils/rbac");

const departmentSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true, match: /^[A-Z][A-Z0-9_]*$/ },
  name: { type: String, required: true, trim: true },
  parentDepartment: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true });

departmentSchema.index({ parentDepartment: 1 });
departmentSchema.index({ active: 1 });

departmentSchema.pre("validate", async function validateHierarchy() {
  const session = this.$session();
  if (this.parentDepartment) {
    if (this._id && this.parentDepartment.toString() === this._id.toString()) {
      this.invalidate("parentDepartment", "A Department cannot be its own parent");
    } else {
      const visited = new Set([this._id?.toString()].filter(Boolean));
      let currentId = this.parentDepartment;
      while (currentId) {
        const key = currentId.toString();
        if (visited.has(key)) {
          this.invalidate("parentDepartment", "Department hierarchy cannot contain a cycle");
          break;
        }
        visited.add(key);
        const query = this.constructor.findById(currentId).select("parentDepartment");
        if (session) query.session(session);
        const current = await query;
        if (!current) {
          this.invalidate("parentDepartment", "Parent Department does not exist");
          break;
        }
        currentId = current.parentDepartment;
      }
    }
  }
  if (this.manager) {
    const managerQuery = User.findById(this.manager).select("role isActive");
    if (session) managerQuery.session(session);
    const manager = await managerQuery;
    if (!manager || !isInternalStaffRole(manager.role)) {
      this.invalidate("manager", "Department manager must be an internal staff User");
    }
  }
});

module.exports = mongoose.model("Department", departmentSchema);
