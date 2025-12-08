const { EXPENSE_TYPE } = require("../constants");

const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const expenseSchema = new Schema({
  type: { type: String, default: EXPENSE_TYPE.OFFICIAL },
  caseId: { type: Schema.Types.ObjectId, required: true },
  debtorId: { type: Schema.Types.ObjectId },
  userId: { type: Schema.Types.ObjectId, required: true },
  assetType: { type: String },
  assetId: { type: Schema.Types.ObjectId },
  amount: { type: Number, required: true },
  currency: { type: String, default: "TL" },
  extra: { type: Object, default: {} },
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Expense", expenseSchema);
