const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const constants = require("../constants");

const shareSchema = new Schema({
  queryId: { type: Schema.Types.ObjectId, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  sharePercentage: { type: Number, default: null, required: true },
  companyId: { type: Schema.Types.ObjectId, default: null },
  isInpoundmentCreated: { type: Boolean, default: null },
  inpoundmentNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  inpoundmentNotificationDoneDate: { type: Date, default: null },
  inpoundmentResponse: { type: String, default: null },
  isMemorialCreated: { type: Boolean, default: null },
  memorialStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  memorialResponse: { type: String, default: null },
  reasonForBeingNegative: { type: String, default: null },
  isSaleAdvancePaid: { type: Boolean, default: null },
  claim103DocumentCreated: { type: Boolean, default: null },
  claim103Status: { type: String, default: null },
  chamberOfCommerceDocumentCreated: { type: Boolean, default: null },
  chamberOfCommerceNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
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

module.exports = mongoose.model("Share", shareSchema);
