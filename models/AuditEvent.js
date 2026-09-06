const mongoose = require("mongoose");

const auditEventSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, immutable: true },
  actorRole: { type: String, default: null, immutable: true },
  actorDepartment: { type: mongoose.Schema.Types.ObjectId, ref: "Department", default: null, immutable: true },
  action: { type: String, required: true, trim: true, immutable: true },
  entityType: { type: String, required: true, trim: true, immutable: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
  entityReference: { type: String, default: null, trim: true, immutable: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  after: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  outcome: { type: String, enum: ["SUCCESS", "FAILURE"], required: true, immutable: true },
  correlationId: { type: String, required: true, trim: true, immutable: true },
  route: { type: String, default: null, trim: true, immutable: true },
  method: { type: String, default: null, trim: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

auditEventSchema.index({ createdAt: -1 });
auditEventSchema.index({ actor: 1, createdAt: -1 });
auditEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditEventSchema.index({ action: 1, outcome: 1, createdAt: -1 });

const rejectMutation = function rejectMutation() {
  throw new Error("Audit events are append-only");
};

for (const hook of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"]) {
  auditEventSchema.pre(hook, rejectMutation);
}
auditEventSchema.pre("save", function rejectExistingSave() {
  if (!this.isNew) throw new Error("Audit events are append-only");
});

module.exports = mongoose.model("AuditEvent", auditEventSchema);
