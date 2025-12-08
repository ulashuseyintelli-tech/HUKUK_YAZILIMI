const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const constants = require("../constants");

const immovableSchema = new Schema({
  queryId: { type: Schema.Types.ObjectId },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  landRegistryOfficeId: { type: Schema.Types.ObjectId, required: true },
  registrationStatus: { type: String },
  typeOfSoil: { type: String },
  soilNumber: { type: String },
  volumeNumber: { type: String },
  pageNumber: { type: String },
  associationName: { type: String },
  city: { type: String },
  district: { type: String },
  street: { type: String },
  local: { type: String },
  cityBlock: { type: String },
  parcel: { type: String },
  area: { type: String },
  mainQuailification: { type: String },
  secondQualification: { type: String },
  block: { type: String },
  floor: { type: String },
  bbNo: { type: String },
  landShareAndDenominator: { type: String },
  isSeized: { type: Boolean, default: null },
  reasonForBeingNegative: { type: String, default: null },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
  isSaleAdvancePaid: { type: Boolean, default: null },
  claim103DocumentCreated: { type: Boolean, default: null },
  claim103Status: { type: String, default: null },
  inpoundmentNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  isZoningStatusDocumentCreated: { type: Boolean, default: null },
  zoningStatusNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  isCadastreDocumentCreated: { type: Boolean, default: null },
  cadastreNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  appraisalResultDocumentCreated: { type: Boolean, default: null },
  appraisalResult: { type: Number },
  claim100DocumentCreated: { type: Boolean, default: null },
  claim100Status: { type: String, default: null },
  appraisalNotificationCreated: { type: Boolean, default: null },
  appraisalNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Immovable", immovableSchema);
