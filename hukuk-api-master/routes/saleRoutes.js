const express = require("express"),
  Sale = require("../models/SaleModel"),
  SaleRequest = require("../models/SaleRequestModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const mongoose = require("mongoose");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const {
  createSaleRequestTasks,
  createSaleTasks,
} = require("../helpers/SaleHelper");

router.get("/byAsset/:assetId", Middlewares.verifyToken, (req, res, next) => {
  const { assetId } = req.params;
  Sale.aggregate([
    {
      $match: {
        assetId: mongoose.Types.ObjectId(assetId),
      },
    },
    {
      $lookup: {
        from: "salerequests",
        localField: "_id",
        foreignField: "saleId",
        as: "saleRequests",
      },
    },
  ])
    .then((sales) => {
      res.send(sales[0]);
    })
    .catch((e) => next(serverError(e)));
});

router.post("/:saleId/request", Middlewares.verifyToken, (req, res, next) => {
  const { saleId } = req.params;
  SaleRequest.create({ saleId })
    .then((saleRequest) => {
      res.send(saleRequest);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:saleId/:property", Middlewares.verifyToken, (req, res, next) => {
  const { saleId, property } = req.params;
  const { propertyValue } = req.body;
  Sale.findByIdAndUpdate(saleId, { [property]: propertyValue }, { new: true })
    .then((sale) => {
      res.send(sale);
      createSaleTasks(req, res, sale);
    })
    .catch((e) => next(serverError(e)));
});

router.put(
  "/request/:requestId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { requestId, property } = req.params;
    const { propertyValue } = req.body;
    SaleRequest.findByIdAndUpdate(
      requestId,
      { [property]: propertyValue },
      { new: true }
    )
      .then((request) => {
        res.send(request);
        createSaleRequestTasks(req, res, request);
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
