const express = require("express"),
  BankQuery = require("../models/BankQueryModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const mongoose = require("mongoose");
const { createBankTasks } = require("../helpers/BankQueryHelper");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");

router.put(
  "/:bankQueryId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { bankQueryId, property } = req.params;
    const { propertyValue } = req.body;
    BankQuery.findOneAndUpdate(
      { _id: bankQueryId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((bankQuery) => {
        BankQuery.aggregate([
          {
            $match: {
              _id: bankQuery._id,
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
          {
            $lookup: {
              from: "notifications",
              localField: "_id",
              foreignField: "assetId",
              as: "notifications",
            },
          },
        ])
          .then((bankQueries) => {
            res.send(bankQueries[0]);
            createBankTasks(req, res, bankQuery);
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
    BankQuery.aggregate([
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
      {
        $lookup: {
          from: "notifications",
          localField: "_id",
          foreignField: "assetId",
          as: "notifications",
        },
      },
    ])
      .then((bankQueries) => {
        res.send(bankQueries);
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
