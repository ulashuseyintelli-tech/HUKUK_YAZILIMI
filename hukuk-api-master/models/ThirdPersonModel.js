const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const thirdPersonSchema = new Schema({
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
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ThirdPerson", thirdPersonSchema);
