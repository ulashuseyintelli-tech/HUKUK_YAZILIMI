const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const querySchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, required: true },
  isAnswered: { type: Boolean, default: null },
  isResultEmpty: { type: Boolean, default: null },
  results: { type: Array, default: [] },
  isDeceased: { type: Boolean, default: false },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Query", querySchema);
