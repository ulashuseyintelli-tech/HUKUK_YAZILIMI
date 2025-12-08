const express = require("express"),
  TaxDue = require("../models/TaxDueModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const mongoose = require("mongoose");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const { createTaxDueTasks } = require("../helpers/TaxDueHelper");

router.post(
  "/:caseId/:debtorId/:queryId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId, queryId } = req.params;
    TaxDue.create({
      caseId,
      debtorId,
      queryId,
      ...req.body,
    })
      .then((taxDue) => {
        createTaxDueTasks(req, res, taxDue);
        res.send(taxDue);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    TaxDue.aggregate([
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
  "/:taxDueId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { taxDueId, property } = req.params;
    const { propertyValue } = req.body;
    TaxDue.findOneAndUpdate(
      { _id: taxDueId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((taxDue) => {
        res.send(taxDue);
        createTaxDueTasks(req, res, taxDue);
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
