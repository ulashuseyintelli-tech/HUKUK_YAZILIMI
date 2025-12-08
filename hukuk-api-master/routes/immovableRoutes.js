const express = require("express"),
  Immovable = require("../models/ImmovableModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const mongoose = require("mongoose");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const Sale = require("../models/SaleModel");
const { createImmovableTasks } = require("../helpers/ImmovableHelper");

router.post(
  "/:caseId/:debtorId/:queryId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId, queryId } = req.params;
    const paramsObject = { caseId, debtorId };
    if (queryId !== "null") {
      paramsObject.queryId = queryId;
    }
    Immovable.create({
      ...paramsObject,
      ...req.body,
    })
      .then((immovable) => {
        if (!req.body.withoutTasks) {
          createImmovableTasks(req, res, immovable);
        }
        Sale.create({
          assetId: immovable._id,
          assetType: "IMMOVABLE",
        })
          .then((sale) => {
            res.send({ ...immovable.toObject(), sales: [sale] });
          })
          .catch((e) => next(serverError(e)));
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:immovableId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { immovableId, property } = req.params;
    const { propertyValue } = req.body;
    Immovable.findOneAndUpdate(
      { _id: immovableId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((immovable) => {
        res.send(immovable);
        createImmovableTasks(req, res, immovable);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    Immovable.aggregate([
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
      .then((docs) => {
        res.send(docs);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get("/:immovableId", Middlewares.verifyToken, (req, res, next) => {
  const { immovableId } = req.params;
  Immovable.aggregate([
    {
      $match: { _id: mongoose.Types.ObjectId(immovableId) },
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
    .then((immovable) => {
      res.send(immovable[0]);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
