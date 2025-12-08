const express = require("express"),
  CreditorCase = require("../models/CreditorCaseModel"),
  router = express.Router();

const { createCreditorCaseTasks } = require("../helpers/CreditorCaseHelper");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const mongoose = require("mongoose");

router.post(
  "/:caseId/:debtorId/:queryId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId, queryId } = req.params;
    CreditorCase.create({
      caseId,
      debtorId,
      queryId,
      ...req.body,
    })
      .then((creditorCase) => {
        createCreditorCaseTasks(req, res, creditorCase);
        res.send(creditorCase);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:creditorCaseId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { creditorCaseId, property } = req.params;
    const { propertyValue } = req.body;
    CreditorCase.findOneAndUpdate(
      { _id: creditorCaseId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((creditorCase) => {
        res.send(creditorCase);
        createCreditorCaseTasks(req, res, creditorCase);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    CreditorCase.aggregate([
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

module.exports = router;
