const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const familyMemberSchema = new Schema({
  debtorId: { type: Schema.Types.ObjectId, required: true },
  queryId: { type: Schema.Types.ObjectId, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true },
  BSN: { type: String },
  proximity: { type: String, required: true },
  identityNumber: { type: String, required: true },
  name: { type: String, required: true },
  surname: { type: String, required: true },
  fathersName: { type: String },
  mothersName: { type: String },
  placeAndDateOfBirth: { type: String },
  maritalStatus: { type: String },
  religion: { type: String },
  registryDate: { type: String },
  death: { type: String, required: true },
  deathDate: { type: String },
  marriage: { type: String },
  gender: { type: String, required: true },
  divorce: { type: String },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("FamilyMember", familyMemberSchema);
