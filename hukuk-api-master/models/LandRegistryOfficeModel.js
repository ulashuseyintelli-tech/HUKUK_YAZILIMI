const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const officeSchema = new Schema({
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  city: { type: String, required: true },
  district: { type: String, required: true },
  notes: { type: String },
});

module.exports = mongoose.model("LandRegistryOffice", officeSchema);
