const express = require("express"),
  Vehicle = require("../models/VehicleModel"),
  router = express.Router();

const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

const Sale = require("../models/SaleModel");
const NormalAsset = require("../models/NormalAssetModel");
const mongoose = require("mongoose");
const { createNormalAssetTasks } = require("../helpers/NormalAssetHelper");

router.post("/:caseId/:debtorId", Middlewares.verifyToken, (req, res, next) => {
  // TODO: İŞLEMLERİN SESSION İLE BAĞLANMASI LAZIM (TÜM SALE OLUŞAN İŞLEMLERİN!!!!!)
  const { caseId, debtorId, queryId } = req.params;
  const { withoutTasks } = req.query;
  NormalAsset.create({
    caseId,
    debtorId,
    queryId,
    ...req.body,
  })
    .then((normalAsset) => {
      if (!withoutTasks) {
        createNormalAssetTasks(req, res, normalAsset);
      }
      Sale.create({
        assetId: normalAsset._id,
        assetType: "NORMAL_ASSET",
      })
        .then((sale) => {
          res.send({ ...normalAsset.toObject(), sales: [sale] });
        })
        .catch((e) => next(serverError(e)));
    })
    .catch((e) => next(serverError(e)));
});

router.put(
  "/:normalAssetId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { normalAssetId, property } = req.params;
    const { propertyValue } = req.body;
    NormalAsset.findOneAndUpdate(
      { _id: normalAssetId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((normalAsset) => {
        res.send(normalAsset);
        createNormalAssetTasks(req, res, normalAsset);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    NormalAsset.aggregate([
      {
        $match: {
          debtorId: mongoose.Types.ObjectId(debtorId),
          caseId: mongoose.Types.ObjectId(caseId),
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
      .then((assets) => {
        res.send(assets);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/byParentAsset/:parentAssetId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { parentAssetId } = req.params;
    NormalAsset.aggregate([
      {
        $match: {
          parentAssetId: mongoose.Types.ObjectId(parentAssetId),
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
      .then((assets) => {
        res.send(assets);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get("/:normalAssetId", Middlewares.verifyToken, (req, res, next) => {
  const { normalAssetId } = req.params;
  NormalAsset.findById(normalAssetId)
    .then((normalAsset) => {
      res.send(normalAsset);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
