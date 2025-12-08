const express = require("express"),
  router = express.Router();

const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const mongoose = require("mongoose");
const Sale = require("../models/SaleModel");
const helper = require("../helpers/PledgedMovableHelper");
const { ASSET_TYPE, CUSTODIAN_INFO } = require("../constants");
const PledgedMovableModel = require("../models/PledgedMovableModel");

router.post("/:caseId/:debtorId", Middlewares.verifyToken, (req, res, next) => {
  // TODO: İŞLEMLERİN SESSION İLE BAĞLANMASI LAZIM (TÜM SALE OLUŞAN İŞLEMLERİN!!!!!)
  const { caseId, debtorId } = req.params;
  const paramsObject = { caseId, debtorId };
  PledgedMovableModel.create({
    ...paramsObject,
    properties: req.body,
  })
    .then((movable) => {
      helper.createPledgedMovableTasks(req, res, movable);
      Sale.create({
        assetId: movable._id,
        assetType: ASSET_TYPE.PLEDGED_MOVABLE,
      })
        .then((sale) => {
          res.send({ ...movable.toObject(), sales: [sale] });
        })
        .catch((e) => next(serverError(e)));
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:_id/:property", Middlewares.verifyToken, (req, res, next) => {
  const { _id, property } = req.params;
  const { propertyValue } = req.body;
  PledgedMovableModel.findOneAndUpdate(
    { _id: _id },
    { [property]: propertyValue, lastUpdate: new Date() },
    { new: true }
  )
    .then((movable) => {
      res.send(movable);
      helper.createPledgedMovableTasks(req, res, movable);
    })
    .catch((e) => next(serverError(e)));
});

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    PledgedMovableModel.aggregate([
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
      .then((movables) => {
        res.send(movables);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get("/:_id", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = req.params;
  PledgedMovableModel.aggregate([
    {
      $match: { _id: mongoose.Types.ObjectId(_id) },
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
    .then((movable) => {
      res.send(movable[0]);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
