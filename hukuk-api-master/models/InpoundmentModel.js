const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const inpoundmentSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, required: true },
  steps: { type: Array, required: true },
  lastUpdate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Inpoundment", inpoundmentSchema);
