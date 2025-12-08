const express = require("express"),
  Share = require("../models/ShareModel"),
  Sale = require("../models/SaleModel"),
  router = express.Router();

const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const { createShareTasks } = require("../helpers/ShareHelper");
const mongoose = require("mongoose");

router.post(
  "/:caseId/:debtorId/:queryId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId, queryId } = req.params;
    Share.create({
      caseId,
      debtorId,
      queryId,
      ...req.body,
    })
      .then((share) => {
        createShareTasks(req, res, share);
        Sale.create({
          assetId: share._id,
          assetType: "SHARE",
        })
          .then((sale) => {
            res.send({ ...share.toObject(), sales: [sale] });
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
    Share.aggregate([
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

router.put("/:shareId/:property", Middlewares.verifyToken, (req, res, next) => {
  const { shareId, property } = req.params;
  const { propertyValue } = req.body;
  Share.findOneAndUpdate(
    { _id: shareId },
    { [property]: propertyValue, lastUpdate: new Date() },
    { new: true }
  )
    .then((share) => {
      res.send(share);
      createShareTasks(req, res, share);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
