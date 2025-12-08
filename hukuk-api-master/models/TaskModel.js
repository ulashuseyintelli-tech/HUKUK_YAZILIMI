const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const taskSchema = new Schema({
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  userIds: { type: [Schema.Types.ObjectId], required: true, ref: "User" },
  caseId: { type: Schema.Types.ObjectId, required: true, ref: "Case" },
  debtorId: { type: Schema.Types.ObjectId, required: false, ref: "Debtor" },
  assetId: { type: Schema.Types.ObjectId },
  assetType: { type: String },
  type: { type: String, required: true },
  startDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  step: { type: Number, default: 0 },
  extra: { type: Object, default: {} },
  extensionHistory: { type: Array, default: [] },
  causeOfCancel: { type: String, default: null },
  canceledUserId: { type: Schema.Types.ObjectId, default: null },
  canceledLinkedTaskId: { type: Schema.Types.ObjectId, default: null },
  completedUserId: { type: Schema.Types.ObjectId, default: null },
  status: { type: String, default: "PENDING" },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Task", taskSchema);
