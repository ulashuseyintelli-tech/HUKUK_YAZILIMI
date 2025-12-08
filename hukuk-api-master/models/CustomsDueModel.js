const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const { CUSTODIAN_INFO } = require("../constants");
const constants = require("../constants");

const customsDueSchema = new Schema({
  customsOfficeId: { type: Schema.Types.ObjectId, required: true },
  queryId: { type: Schema.Types.ObjectId, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  isSeized: { type: Boolean, default: null },
  deFactoSeizeDate: { type: Date, default: null },
  isAssetReceived: { type: Boolean },
  receivedAssets: { type: [], default: [] },
  allReceivedAssetsEntered: { type: Boolean, default: false },
  claim103DocumentCreated: { type: Boolean, default: null },
  claim103Status: { type: String, default: null },
  custodianInfo: {
    type: Object,
    default: CUSTODIAN_INFO,
  },
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

module.exports = mongoose.model("CustomsDue", customsDueSchema);
