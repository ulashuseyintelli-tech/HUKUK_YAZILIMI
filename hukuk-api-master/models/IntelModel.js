const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const intelType = {
  isRequested: null,
  requestDate: null,
  isResponsed: null,
  responseDate: null,
  aliasRequested: null,
  aliasRequestDate: null,
  aliasResponsed: null,
  aliasResponseDate: null,
  isResponseUseful: null,
  response: {
    isAddressGiven: null,
    isIdentityNumberGiven: null,
    isTaxNumberGiven: null,
    addresses: null,
    identityNumber: null,
    taxNumber: null,
    addressesSameWithOtherIntelType: null,
  },
  isEmailSent: false,
};

const intelSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  isCityKnown: { type: Boolean, default: null },
  isDistrictKnown: { type: Boolean, default: null },
  knownDistrict: { type: String, default: null },
  knownCity: { type: String, default: null },
  areTypesSelected: { type: Boolean, default: null },
  selectedTypes: { type: Array, default: null },
  ssi: {
    type: Object,
    default: intelType,
  },
  chamberOfCommerce: {
    type: Object,
    default: intelType,
  },
  customs: {
    type: Object,
    default: intelType,
  },
  taxOffice: {
    type: Object,
    default: intelType,
  },
  localHealthAuthority: {
    type: Object,
    default: intelType,
  },
  civilRegistry: {
    type: Object,
    default: intelType,
  },
  comac: {
    type: Object,
    default: intelType,
  },
  police: {
    type: Object,
    default: intelType,
  },
  gsm: {
    type: Object,
    default: intelType,
  },
  mernis: {
    type: Object,
    default: intelType,
  },
  client: {
    type: Object,
    default: intelType,
  },
  updatedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Intel", intelSchema);
