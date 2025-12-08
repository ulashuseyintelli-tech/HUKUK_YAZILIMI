const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const creditorSchema = new Schema({
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, required: true },
  institutionName: { type: String },
  institutionType: { type: String },
  MERSISNumber: { type: String },
  name: { type: String },
  surname: { type: String },
  identityNumber: { type: String },
  gender: { type: String },
  instution: { type: String },
  phoneNumbers: { type: [Object] },
  emails: { type: [String] },
  notes: { type: String },
  addresses: { type: [Object], required: true },
  taxOffice: { type: String },
  taxNumber: { type: String },
  socialSecurityNumber: { type: String },
  tradeRegisterNumber: { type: String },
  deputationNumber: { type: String },
  powers: { type: String },
  bankAccountInformations: { type: [Object] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Creditor", creditorSchema);
