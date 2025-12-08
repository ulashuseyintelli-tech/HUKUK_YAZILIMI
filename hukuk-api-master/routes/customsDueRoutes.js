const express = require("express"),
  CustomsDue = require("../models/CustomsDueModel"),
  router = express.Router();

const mongoose = require("mongoose");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const Sale = require("../models/SaleModel");
const { createCustomsDueTasks } = require("../helpers/CustomsDueHelper");
const NormalAssetModel = require("../models/NormalAssetModel");

router.post(
  "/:caseId/:debtorId/:queryId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId, queryId } = req.params;
    CustomsDue.create({
      caseId,
      debtorId,
      queryId,
      ...req.body,
    })
      .then((customsDue) => {
        Sale.create({
          assetId: customsDue._id,
          assetType: "CUSTOMS",
        })
          .then((sale) => {
            res.send({ ...customsDue.toObject(), sales: [sale] });
            createCustomsDueTasks(req, res, customsDue);
          })
          .catch((e) => next(serverError(e)));
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    CustomsDue.aggregate([
      {
        $match: {
          debtorId: mongoose.Types.ObjectId(debtorId),
          caseId: mongoose.Types.ObjectId(caseId),
        },
      },
      {
        $lookup: {
          from: "normalassets",
          localField: "_id",
          foreignField: "parentAssetId",
          as: "receivedAssets",
        },
      },
      {
        $lookup: {
          from: "sales",
          localField: "_id",
          foreignField: "assetId",
          as: "sales",
        },
      },
    ])
      .then((docs) => {
        res.send(docs);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:customsDueId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { customsDueId, property } = req.params;
    const { propertyValue } = req.body;
    CustomsDue.findOneAndUpdate(
      { _id: customsDueId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .lean()
      .then((customsDue) => {
        NormalAssetModel.find({ parentAssetId: customsDue._id })
          .then((receivedAssets) => {
            res.send({ ...customsDue, receivedAssets });
            createCustomsDueTasks(req, res, { ...customsDue, receivedAssets });
          })
          .catch((e) => console.log(e));
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
