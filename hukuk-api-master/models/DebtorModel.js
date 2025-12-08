const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const debtorSchema = new Schema({
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  type: { type: String, required: true },
  kind: { type: String, required: true },
  institutionName: { type: String },
  name: { type: String },
  surname: { type: String },
  identityNumber: { type: String },
  deputy: { type: String },
  gender: { type: String },
  phoneNumbers: { type: [Object] },
  rule35: { type: Boolean, default: false },
  emails: { type: [String] },
  taxNumber: { type: String },
  taxOffice: { type: String },
  addresses: { type: [Object], required: true },
  MERSISNumber: { type: String },
  bankAccountInformations: { type: [Object] },
  isThirdPerson: { type: Boolean, required: true },
  thirdPersonReasons: { type: Array, default: [] },
  extra: { type: Object, default: {} },
  isBecameDebtor: { type: Boolean, default: false },
  isIntelligenceDone: { type: Boolean, default: null },
  isInformationsAskedAgain: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

debtorSchema.index({ name: "text", surname: "text", institutionName: "text" });

module.exports = mongoose.model("Debtor", debtorSchema);
