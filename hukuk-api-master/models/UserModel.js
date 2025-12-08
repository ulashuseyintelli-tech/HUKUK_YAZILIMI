const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const userSchema = new Schema({
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  username: {
    type: String,
    required: false,
    unique: false,
    default: function () {
      return (
        Math.floor(Math.random() * 900000000300000000000) + 1000000000000000
      );
    },
  },
  type: { type: String, required: true },
  password: { type: String },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  surname: { type: String, required: true },
  identityNumber: { type: String },
  gender: { type: String },
  phoneNumbers: { type: [Object] },
  createdAt: { type: Date, default: Date.now },
  addresses: { type: [Object] },
  bankAccountInformations: { type: [Object] },
  notes: { type: String },
  isCaseInitializationNoteVisible: { type: Boolean, default: true },
  lawyerDetails: {
    type: Object,
    default: {
      registrationNumber: "",
      tbbNumber: "",
      taxNumber: "",
      taxOffice: "",
      deputyType: "",
      type: "",
    },
  },
});

module.exports = mongoose.model("User", userSchema);
