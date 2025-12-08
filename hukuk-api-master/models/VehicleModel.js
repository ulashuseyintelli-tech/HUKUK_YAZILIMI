const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const { CUSTODIAN_INFO, NOTIFICATION_STATUS } = require("../constants");
const constants = require("../constants");

const vehicleSchema = new Schema({
  queryId: { type: Schema.Types.ObjectId, default: null }, // 8. Dosya tipinde rehinli araç eklerken queryId girmeden eklememiz gerekiyor, bundan dolayı required: false
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
  licenseNumber: { type: String },
  brand: { type: String, required: true },
  model: { type: String, required: true },
  ownershipDate: { type: String },
  kind: { type: String },
  type: { type: String },
  color: { type: String },
  intendedUse: { type: String },
  motorNumber: { type: String },
  chassisNumber: { type: String },
  isSeized: { type: Boolean, default: null },
  reasonForBeingNegative: { type: String, default: null },
  isWarranted: { type: Boolean, default: null },
  isSaleAdvancePaid: { type: Boolean, default: null },
  claim103DocumentCreated: { type: Boolean, default: null },
  claim103Status: { type: String, default: null },
  inpoundmentNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  custodianInfo: {
    type: Object,
    default: CUSTODIAN_INFO,
  },
  appraisalResultDocumentCreated: { type: Boolean, default: null },
  appraisalResult: { type: Number },
  claim100DocumentCreated: { type: Boolean, default: null },
  claim100Status: { type: String, default: null },
  appraisalNotificationCreated: {
    type: Boolean,
    default: null,
  },
  appraisalNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Vehicle", vehicleSchema);
