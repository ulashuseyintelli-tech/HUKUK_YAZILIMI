const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const constants = require("../constants");

const pledgedMovableSchema = new Schema({
  queryId: { type: Schema.Types.ObjectId },
  caseId: { type: Schema.Types.ObjectId, required: true, unique: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  properties: { type: Object, required: true },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
  custodianInfo: {
    type: Object,
    default: constants.CUSTODIAN_INFO,
  },
  isSaleAdvancePaid: { type: Boolean, default: null },
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

module.exports = mongoose.model("PledgedMovable", pledgedMovableSchema);
