const constants = require("../constants");

const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const lawOfficeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, required: true, unique: true },
  address: { type: Object, required: true },
  phones: { type: [String] },
  informations: { type: String },
  executionOffice: { type: String },
  bankAccounts: { type: [Object] },
  caseTaskPermissions: { type: Array },
  caseTaskTransitionDays: { type: Number },
  queryList: { type: Array, default: [] },
  bulkQueryBankList: { type: Array, default: [] },
  queryReminderDays: { type: Object, default: constants.QUERY_REMINDER_DAYS },
  taskTransitionDays: {
    type: Object,
    default: constants.getDefaultTaskTransitionDays(),
  },
  extraCausesOfDebt: { type: Array, default: [] },
  restrictionThreshold: { type: Number, default: 50 },
  bankAccountBalanceThreshold: { type: Number, default: 1000 },
  deFactoIntelRequired: { type: Boolean, default: true },
  saleNewspaperMandatoryAssetTypes: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("LawOffice", lawOfficeSchema);
