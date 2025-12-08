const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const constants = require("../constants");

const taxDueSchema = new Schema({
  taxOfficeId: { type: Schema.Types.ObjectId, required: true },
  queryId: { type: Schema.Types.ObjectId, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  isSeized: { type: Boolean, default: null },
  dueAmount: { type: Number, required: true },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
  isDueRequestCreated: { type: Boolean, default: false },
  dueRequestResponse: { type: Boolean, default: null },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("TaxDue", taxDueSchema);
