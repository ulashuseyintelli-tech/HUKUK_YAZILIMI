const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const officeSchema = new Schema({
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  city: { type: String, required: true },
  district: { type: String, required: true },
  bankName: { type: String },
  IBAN: { type: String },
  notes: { type: String },
});

module.exports = mongoose.model("CustomsOffice", officeSchema);
