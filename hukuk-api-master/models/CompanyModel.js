const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const companySchema = new Schema({
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  kind: { type: String, required: true },
  name: { type: String },
  phoneNumbers: { type: [Object] },
  emails: { type: [String] },
  taxNumber: { type: String },
  taxOffice: { type: String },
  addresses: { type: [Object], required: true },
  MERSISNumber: { type: String },
  notes: { type: String },
  bankAccountInformations: { type: [Object] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Company", companySchema);
