const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const courtSchema = new Schema({
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  assetId: { type: Schema.Types.ObjectId },
  assetType: { type: String },
  name: { type: String, required: true },
  fileNumber: { type: String, required: true },
  startDate: { type: Date, required: true },
  juridicalDays: {
    type: [{ date: Date, status: { type: Number, default: 0 } }],
    required: true,
  },
  isAssurancePaid: { type: Boolean, default: null },
  result: { type: Boolean, default: null },
  supremeCourtDecision: { type: Boolean, default: null },
  type: { type: String, required: true },
  lastUpdate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Court", courtSchema);
