const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const caseSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true },
  currency: { type: String, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  payee: { type: String, required: true },
  onAccount: { type: String, required: false },
  voucherSerialNumber: { type: String, required: false },
  voucherRotationNumber: { type: String, required: false },
  description: { type: String, required: false },
  date: { type: String, default: Date.now },
  createdAt: { type: String, default: Date.now },
});

module.exports = mongoose.model("Payment", caseSchema);
