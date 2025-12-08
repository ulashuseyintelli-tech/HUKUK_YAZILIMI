const express = require("express"),
  Ssi = require("../models/SsiModel"),
  router = express.Router();

const mongoose = require("mongoose");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const { createSsiTasks, isMoreThanOneMonth } = require("../helpers/SsiHelper");

router.post(
  "/:caseId/:debtorId/:queryId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId, queryId } = req.params;
    const ssiObject = {
      caseId,
      debtorId,
      queryId,
      ...req.body,
    };
    if (!isMoreThanOneMonth(req.body.registrationDate)) {
      ssiObject.shouldCreateInpoundment = true;
    }
    Ssi.create(ssiObject)
      .then((ssi) => {
        createSsiTasks(req, res, ssi);
        res.send(ssi);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    Ssi.aggregate([
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

router.put("/:ssiId/:property", Middlewares.verifyToken, (req, res, next) => {
  const { ssiId, property } = req.params;
  const { propertyValue } = req.body;
  Ssi.findOneAndUpdate(
    { _id: ssiId },
    { [property]: propertyValue, lastUpdate: new Date() },
    { new: true }
  )
    .then((ssi) => {
      res.send(ssi);
      createSsiTasks(req, res, ssi);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
