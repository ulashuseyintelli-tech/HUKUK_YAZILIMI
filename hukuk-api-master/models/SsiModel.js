const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const constants = require("../constants");

const ssiSchema = new Schema({
  queryId: { type: Schema.Types.ObjectId, required: true },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  registrationDate: { type: Date, required: true },
  isSeized: { type: Boolean, default: null },
  companyId: { type: Object, required: true },
  salaryInfo: {
    type: Object,
    default: {
      date: null,
      amount: null,
      type: constants.SSI_SALARY_TYPE.DIRECT.value,
      percentageToCollection: null,
      amountToCollection: null,
    },
  },
  shouldCreateInpoundment: { type: Boolean, default: null },
  isInpoundmentCreated: { type: Boolean, default: false },
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
  isAddedToIntel: { type: Boolean, default: false },
  intelResponse: { type: Boolean, default: null },
  restriction: { type: Object, default: constants.DEFAULT_RESTRICTION },
  claim100DocumentCreated: { type: Boolean, default: null },
  claim100Status: { type: String, default: null },
  lastUpdate: { type: Date, default: Date.now }, //TODO: Tüm lastUpdate leri unutma!!!!
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Ssi", ssiSchema);
