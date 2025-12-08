const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const taskLogSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  taskId: { type: Schema.Types.ObjectId, required: true, ref: "Task" },
  operationType: { type: String, required: true },
  updateDescription: { type: Object },
  clusterTime: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("TaskLog", taskLogSchema);
