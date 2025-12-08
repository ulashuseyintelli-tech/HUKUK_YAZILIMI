const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const constants = require("../constants");

const bankQuerySchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  bankName: { type: String, required: true },
  firstNotificationStatus: { type: String, default: null },
  firstResponse: { type: String, default: null },
  secondNotificationCreated: { type: Boolean, default: null },
  secondNotificationStatus: { type: String, default: null },
  secondResponse: { type: String, default: null },
  thirdNotificationCreated: { type: Boolean, default: null },
  thirdNotificationStatus: { type: String, default: null },
  thirdResponse: { type: String, default: null },
  restrictionsNotificationCreated: { type: Boolean, default: null },
  restrictionsNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  restrictionsNotificationResponse: { type: String, default: null },
  isMemorialCreated: { type: Boolean, default: null },
  isMemorialCreated: { type: Boolean, default: null },
  memorialStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  memorialResponse: { type: String, default: null },
  isAccountExist: { type: Boolean, default: null },
  accountBalance: { type: Number, default: null },
  isCancelledByThreshold: { type: Boolean, default: null },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
  claim100DocumentCreated: { type: Boolean, default: null },
  claim100Status: { type: String, default: null },
  isDueRequestCreated: { type: Boolean, default: null },
  dueRequestResponse: { type: Boolean, default: null },
  shareAmount: { type: Number, default: 0 },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("BankQuery", bankQuerySchema);
