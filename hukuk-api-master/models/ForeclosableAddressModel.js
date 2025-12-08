const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const foreclosableAddressSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  city: { type: String, required: true },
  district: { type: String, required: true },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model(
  "ForeclosableAddress",
  foreclosableAddressSchema
);
