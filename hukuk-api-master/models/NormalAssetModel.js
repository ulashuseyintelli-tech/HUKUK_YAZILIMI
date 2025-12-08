const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const { CUSTODIAN_INFO } = require("../constants");
const constants = require("../constants");

const normalAssetSchema = new Schema({
  queryId: { type: Schema.Types.ObjectId }, // 8. Dosya tipinde rehinli araç eklerken queryId girmeden eklememiz gerekiyor, bundan dolayı required: false
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  parentAssetId: { type: Schema.Types.ObjectId, default: null },
  parentAssetType: { type: String, default: null },
  name: { type: String, required: true },

  type: { type: String, required: true },
  brand: { type: String },
  color: { type: String },
  size: { type: String },
  isSeized: { type: Boolean, default: null },
  reasonForBeingNegative: { type: String, default: null },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
  isSaleAdvancePaid: { type: Boolean, default: null },
  inpoundmentNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  custodianInfo: {
    type: Object,
    default: CUSTODIAN_INFO,
  },
  claim100DocumentCreated: { type: Boolean, default: null },
  claim100Status: { type: String, default: null },
  appraisalResultDocumentCreated: { type: Boolean, default: null },
  appraisalResult: { type: Number },
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

module.exports = mongoose.model("NormalAsset", normalAssetSchema);
