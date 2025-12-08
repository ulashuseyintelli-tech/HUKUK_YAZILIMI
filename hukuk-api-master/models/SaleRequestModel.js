const constants = require("../constants");

const mongoose = require("mongoose"),
  Schema = mongoose.Schema;

mongoose.Promise = Promise;

const saleRequestSchema = new Schema({
  saleId: { type: Schema.Types.ObjectId, required: true },
  trackingNumber: { type: String, default: null },
  isRespond: { type: Boolean, default: null },
  newsletterAdvertisementPublished: { type: Boolean, default: null },
  responseStatus: { type: Boolean, default: null },
  reasonForBeingNegative: { type: String, default: null },
  days: { type: Object, default: [constants.SALE_DAY, constants.SALE_DAY] },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("SaleRequest", saleRequestSchema);
