const { NOTIFICATION_STATUS } = require("../constants");

const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const notificationSchema = new Schema({
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId, required: true },
  thirdPersonId: { type: Schema.Types.ObjectId },
  inpoundmentId: { type: Schema.Types.ObjectId, required: false },
  kind: { type: String, required: false },
  type: { type: String, required: true },
  level: { type: Number, default: 1 },
  address: { type: Object, required: true },
  barcodeNumber: { type: String },
  status: { type: String, default: NOTIFICATION_STATUS.PENDING },
  objectionDate: { type: Date, default: null },
  assetType: { type: String },
  assetId: { type: Schema.Types.ObjectId },
  doneDate: { type: Date, default: null },
  recipient: { type: String },
  notificationDate: { type: Date, default: Date.now },
  lastUpdate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Notification", notificationSchema);
