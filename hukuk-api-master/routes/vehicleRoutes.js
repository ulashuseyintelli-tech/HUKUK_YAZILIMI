const express = require("express"),
  Vehicle = require("../models/VehicleModel"),
  router = express.Router();

const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const mongoose = require("mongoose");
const Sale = require("../models/SaleModel");
const { createVehicleTasks } = require("../helpers/VehicleHelper");
const { ASSET_TYPE } = require("../constants");

router.post(
  "/:caseId/:debtorId/:queryId",
  Middlewares.verifyToken,
  (req, res, next) => {
    // TODO: İŞLEMLERİN SESSION İLE BAĞLANMASI LAZIM (TÜM SALE OLUŞAN İŞLEMLERİN!!!!!)
    const { caseId, debtorId, queryId } = req.params;
    const { withoutTasks } = req.query;
    const paramsObject = { caseId, debtorId };
    if (mongoose.isValidObjectId(queryId)) {
      paramsObject.queryId = queryId;
    }
    Vehicle.create({
      ...paramsObject,
      ...req.body,
    })
      .then((vehicle) => {
        if (!withoutTasks) {
          createVehicleTasks(req, res, vehicle);
        }
        Sale.create({
          assetId: vehicle._id,
          assetType: ASSET_TYPE.VEHICLE,
        })
          .then((sale) => {
            res.send({ ...vehicle.toObject(), sales: [sale] });
          })
          .catch((e) => next(serverError(e)));
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:vehicleId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { vehicleId, property } = req.params;
    const { propertyValue } = req.body;
    Vehicle.findOneAndUpdate(
      { _id: vehicleId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .then((vehicle) => {
        res.send(vehicle);
        createVehicleTasks(req, res, vehicle);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/byDebtor/:debtorId/",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    Vehicle.aggregate([
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
      .then((vehicles) => {
        res.send(vehicles);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get("/:vehicleId", Middlewares.verifyToken, (req, res, next) => {
  const { vehicleId } = req.params;
  Vehicle.aggregate([
    {
      $match: { _id: mongoose.Types.ObjectId(vehicleId) },
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
    .then((vehicle) => {
      res.send(vehicle[0]);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
