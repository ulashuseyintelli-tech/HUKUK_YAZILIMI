const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const collectionSchema = new Schema({
  type: { type: String, required: true },
  payee: { type: String, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  assetType: { type: String },
  assetId: { type: Schema.Types.ObjectId },
  amount: { type: Number, required: true },
  receivedMoneyCurrency: { type: String, default: "TL" },
  extra: { type: Object, default: {} },
  date: { type: Date, required: true },
  notes: { type: Array, default: [] },
  description: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Collection", collectionSchema);
