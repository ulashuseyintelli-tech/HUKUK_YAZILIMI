const express = require("express"),
  Patent = require("../models/PatentModel"),
  router = express.Router();

const { serverError } = require("../helpers/ErrorHelper");
const { createPatentTasks } = require("../helpers/PatentHelper");
const Middlewares = require("../middlewares/Middlewares");
const SaleModel = require("../models/SaleModel");
const mongoose = require("mongoose");

router.post(
  "/:caseId/:debtorId/:queryId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId, queryId } = req.params;
    Patent.create({
      caseId,
      debtorId,
      queryId,
      ...req.body,
    })
      .then((patent) => {
        SaleModel.create({
          assetId: patent._id,
          assetType: "PATENT",
        })
          .then((sale) => {
            createPatentTasks(req, res, patent);
            res.send({ ...patent.toObject(), sales: [sale] });
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
    Patent.aggregate([
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

router.put(
  "/:patentId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { patentId, property } = req.params;
    const { propertyValue } = req.body;
    Patent.findOneAndUpdate(
      { _id: patentId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((patent) => {
        createPatentTasks(req, res, patent);
        res.send(patent);
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
