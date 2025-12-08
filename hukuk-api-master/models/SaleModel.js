const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const saleSchema = new Schema({
  assetId: { type: Schema.Types.ObjectId, required: true },
  assetType: { type: String, required: true },
  isSoldByAnotherCreditor: { type: Boolean, default: null },
  dateOfSoldByAnotherCreditor: { type: Date, default: null },
  isSaleRequested: { type: Boolean, default: false },
  saleAmount: { type: Number, default: 0 },
  boughtByUs: { type: Boolean, default: null },
  shareAmount: { type: Number, default: 0 },
  isMoneyTaken: { type: Boolean, default: null },
  isMoneyShared: { type: Boolean, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Sale", saleSchema);
