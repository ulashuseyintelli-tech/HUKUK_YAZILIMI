const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const constants = require("../constants");

const patentSchema = new Schema({
  queryId: { type: Schema.Types.ObjectId, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  type: { type: String, required: true },
  registrationNumber: { type: String, required: true },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
  isSeized: { type: Boolean, default: null },
  reasonForBeingNegative: { type: String, default: null },
  isSaleAdvancePaid: { type: Boolean, default: null },
  claim103DocumentCreated: { type: Boolean, default: null },
  claim103Status: { type: String, default: null },
  inpoundmentNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
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

module.exports = mongoose.model("Patent", patentSchema);
