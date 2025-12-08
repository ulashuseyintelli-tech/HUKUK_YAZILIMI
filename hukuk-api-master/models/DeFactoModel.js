const { CUSTODIAN_INFO } = require("../constants");
const constants = require("../constants");

const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const deFactoSchema = new Schema({
  foreclosableAddressId: { type: Schema.Types.ObjectId, required: true },
  description: { type: String, default: null },
  date: { type: Date, default: Date.now },
  isDebtorExist: { type: Boolean, default: null },
  isPoliceHelped: { type: Boolean, default: null },
  is103LeftToPlace: { type: Boolean, default: null },
  isMoneyReceived: { type: Boolean, default: null },
  receivedMoneyAmount: { type: Number, default: null },
  personGotMoney: { type: Number, default: null },
  isMoneyRequested: { type: Boolean, default: null },
  isReceivedMoneyDeclared: { type: Boolean, default: false },
  isAssetReceived: { type: Boolean, default: null },
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

  isGuaranteed: { type: Boolean, default: null },
  guaranteeId: { type: Schema.Types.ObjectId, default: null },
  isCommitmentReceived: { type: Boolean, default: null },
  commitmentId: { type: Schema.Types.ObjectId, default: null },
  consentToGarnishment: { type: Boolean, default: null },
  companyId: { type: Schema.Types.ObjectId, default: null },
  personConsentGarnishment: { type: Number, default: null },
  thirdPersonConsentGarnishmentId: {
    type: Schema.Types.ObjectId,
    default: null,
  },
  garnishmentDetails: { type: Object, default: constants.GARNISHMENT_DETAILS },
  isInpoundmentCreated: { type: Boolean, default: null },
  inpoundmentNotificationStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  inpoundmentResponse: { type: String, default: null },
  isMemorialCreated: { type: Boolean, default: null },
  memorialStatus: {
    type: String,
    default: constants.NOTIFICATION_STATUS.PENDING,
  },
  memorialResponse: { type: String, default: null },
  garnishmentClaim100Created: { type: Boolean, default: null },
  garnishmentClaim100Status: { type: String, default: null },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("DeFacto", deFactoSchema);
