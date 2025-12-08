const {
  HYPOTEC_INFO,
  BANKRUPTCY_INFO,
  WRIT,
  CHILDREN_DETAILS,
  EVACUATION_AND_DELIVERY_DETAILS,
  RENTAL_DETAILS,
  EVICTION,
} = require("../constants");

const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const caseSchema = new Schema({
  trackingNumber: { type: Number },
  lawOfficeId: { type: Schema.Types.ObjectId, required: true },
  number: { type: Number },
  date: { type: Date, default: Date.now },
  type: { type: String, required: true },
  status: { type: String, required: true },
  way: { type: String, required: false },
  executionFileNumber: { type: String, required: true },
  executionOfficeId: { type: Schema.Types.ObjectId },
  lawyerIds: { type: [Schema.Types.ObjectId], default: [] },
  clientIds: { type: [Schema.Types.ObjectId], default: [] },
  debtorIds: { type: [Schema.Types.ObjectId], default: [] },
  hypotecInfo: { type: Object, default: HYPOTEC_INFO },
  bankruptcyInfo: { type: Object, default: BANKRUPTCY_INFO },
  writ: { type: Object, default: WRIT },
  evacuationAndDeliveryDetails: {
    type: Object,
    default: EVACUATION_AND_DELIVERY_DETAILS,
  },
  eviction: { type: Object, default: EVICTION },
  children: { type: Array, default: [] },
  childrenDetails: { type: Object, default: CHILDREN_DETAILS },
  rentalDetails: { type: Object, default: RENTAL_DETAILS },
  isDetailsCompleted: { type: Boolean, default: false },
  isClientsCompleted: { type: Boolean, default: false },
  isLawyersCompleted: { type: Boolean, default: false },
  isDebtorsCompleted: { type: Boolean, default: false },
  isHypotecInfoCompleted: { type: Boolean, default: false },
  isDuesCompleted: { type: Boolean, default: false },
  isWritDetailsCompleted: { type: Boolean, default: false },
  isChildrenCompleted: { type: Boolean, default: false },
  isRentalDetailsCompleted: { type: Boolean, default: false },
  isEnforcementRequestPaperCreated: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Case", caseSchema);
