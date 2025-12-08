const express = require("express"),
  Collection = require("../models/CollectionModel"),
  router = express.Router();

const mongoose = require("mongoose");
const { handleCollectionTasks } = require("../helpers/CollectionHelper");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const DebtorModel = require("../models/DebtorModel");

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  Collection.create({
    ...req.body,
  })
    .then((collection) => {
      collection = collection.toObject();
      DebtorModel.findById(collection.debtorId)
        .then((debtor) => {
          res.send({ ...collection, debtor });
          handleCollectionTasks(req, res, collection);
        })
        .catch((e) => next(serverError(e)));
    })
    .catch((e) => next(serverError(e)));
});

router.get("/byAsset/:assetId", Middlewares.verifyToken, (req, res, next) => {
  const { assetId } = req.params;
  Collection.aggregate([
    {
      $match: {
        assetId: mongoose.Types.ObjectId(assetId),
      },
    },
    {
      $lookup: {
        from: "debtors",
        localField: "debtorId",
        foreignField: "_id",
        as: "debtor",
      },
    },
  ])
    .then((docs) => {
      docs.map((doc) => (doc.debtor = doc.debtor[0]));
      res.send(docs);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/byCase/:caseId", Middlewares.verifyToken, (req, res, next) => {
  const { caseId } = req.params;
  Collection.find({ caseId })
    .then((cols) => {
      res.send(cols);
    })
    .catch((e) => next(serverError(e)));
});

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    Collection.aggregate([
      {
        $match: {
          debtorId: mongoose.Types.ObjectId(debtorId),
          caseId: mongoose.Types.ObjectId(caseId),
        },
      },
    ])
      .then((docs) => res.send(docs))
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:collectionId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { collectionId, property } = req.params;
    const { propertyValue } = req.body;
    Collection.findOneAndUpdate(
      { _id: collectionId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((collection) => {
        res.send(collection);
        // createSsiTasks(req, res, ssi);
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
