const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const dueSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  causeOfDebt: { type: String, required: true },
  expiryDate: { type: String, required: true },
  totalAmount: { type: Number, required: true },
  currency: { type: String, required: true },
  description: { type: String },
  beforeCaseUsury: { type: Number },
  afterCaseUsury: { type: Number },
  presentationDate: { type: Date },
  chequeSerialNumber: { type: Number },
  bankAndBranch: { type: String },
  chequePersons: { type: Array },
  editIn: { type: String },
  accountNumber: { type: String },
  customerNumber: { type: String },
  documentDate: { type: Date },
  placeOfDrawing: { type: String },
  instrumentNumber: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Due", dueSchema);
