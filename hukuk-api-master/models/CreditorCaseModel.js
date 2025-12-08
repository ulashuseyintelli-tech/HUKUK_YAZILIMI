const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const constants = require("../constants");

const creditorCaseSchema = new Schema({
  queryId: { type: Schema.Types.ObjectId, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  dueAmount: { type: Number, required: true },
  thirdPersonId: { type: Schema.Types.ObjectId, required: true },
  executionOfficeId: { type: Schema.Types.ObjectId, required: true },
  executionFileNumber: { type: String, required: true },
  isSeized: { type: Boolean, default: null },
  claim103DocumentCreated: { type: Boolean, default: null },
  claim103Status: { type: String, default: null },
  isThirdPersonWarned: { type: Boolean, default: null },
  isPaid: { type: Boolean, default: null },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("CreditorCase", creditorCaseSchema);
