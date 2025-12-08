const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const commitmentSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  commitmentDate: { type: Date, required: true },
  debtorId: { type: Schema.Types.ObjectId, default: null },
  totalAmount: { type: Number, required: true },
  isSplittedToInstallments: { type: Boolean, required: true },
  areInstallmentsFree: { type: Boolean, required: true },
  firstInstallmentDate: { type: Date, required: true },
  installmentsCount: { type: Number, required: true },
  installmentsIntervalByDays: { type: Number, required: true },
  calculatedInstallments: { type: [Object], required: true },
  assetType: { type: String, required: false },
  assetId: { type: Schema.Types.ObjectId, required: false },
  createdAt: { type: Date, default: Date.now },
  lastUpdate: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Commitment", commitmentSchema);
