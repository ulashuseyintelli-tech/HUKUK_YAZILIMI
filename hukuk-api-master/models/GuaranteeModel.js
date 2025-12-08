const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const guaranteeSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  thirdPersonId: { type: Schema.Types.ObjectId, required: true },
  isPartnerConsentient: { type: Boolean, required: true },
  amount: { type: Number, required: true },
  isFeePaid: { type: Boolean, required: true },
  feePayer: { type: String },
  assetType: { type: String, required: false },
  assetId: { type: Schema.Types.ObjectId, required: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Guarantee", guaranteeSchema);
