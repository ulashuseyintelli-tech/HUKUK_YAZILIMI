const express = require("express"),
  ForeclosableAddress = require("../models/ForeclosableAddressModel"),
  DeFacto = require("../models/DeFactoModel"),
  router = express.Router();

const mongoose = require("mongoose");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const {
  createTask,
  createForeclosableAddressTask,
  doneTaskMany,
} = require("../helpers/TaskHelper");
const { TASK_TYPE, TASK_STATUS } = require("../constants");
const {
  createDeFactoTasks,
  createForeclosableAddressAutomatically,
} = require("../helpers/DeFactoHelper");
const Sale = require("../models/SaleModel");
const constants = require("../constants");
const NormalAssetModel = require("../models/NormalAssetModel");
const TaskModel = require("../models/TaskModel");
const TaskHelper = require("../helpers/TaskHelper");

router.get("/:addressId", Middlewares.verifyToken, (req, res, next) => {
  const { addressId } = req.params;
  DeFacto.aggregate([
    {
      $match: {
        foreclosableAddressId: mongoose.Types.ObjectId(addressId),
      },
    },
    {
      $lookup: {
        from: "normalassets",
        localField: "_id",
        foreignField: "parentAssetId",
        as: "receivedAssets",
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
    .exec()
    .then((addresses) => {
      res.send(addresses);
    })
    .catch((e) => next(serverError(e)));
});

router.post(
  "/:caseId/:debtorId/address",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    ForeclosableAddress.create({
      caseId,
      debtorId,
      ...req.body,
    })
      .then((address) => {
        res.send(address);
        createForeclosableAddressTask(res, address);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.post("/:addressId", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = res.locals.decoded;
  DeFacto.create({
    foreclosableAddressId: req.params.addressId,
  })
    .then((deFacto) => {
      Sale.create({
        assetId: deFacto._id,
        assetType: "DE_FACTO",
      })
        .then((sale) => {
          res.send({ ...deFacto.toObject(), sales: [sale] });
        })
        .catch((e) => next(serverError(e)));
      doneTaskMany(
        {
          type: TASK_TYPE.SEIZE_DE_FACTO_REQUIRED,
          assetType: constants.ASSET_TYPE.DE_FACTO,
          assetId: req.params.addressId,
          status: TASK_STATUS.PENDING,
        },
        null,
        _id
      );
      ForeclosableAddress.findById(req.params.addressId).then((address) => {
        createTask(res, address, {
          assetId: deFacto._id,
          assetType: "DE_FACTO",
          type: TASK_TYPE.DE_FACTO_IS_DEBTOR_EXIST,
        });
      });
    })
    .catch((e) => next(serverError(e)));
});

router.put("/intel/:taskId", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = res.locals.decoded;
  const { taskId } = req.params;
  const { isForeclosable } = req.body;
  TaskModel.findById(taskId)
    .then((task) => {
      if (task) {
        TaskHelper.doneTaskMany(
          { _id: taskId },
          async () => {
            if (isForeclosable) {
              await createForeclosableAddressAutomatically(
                task.caseId,
                task.debtorId,
                task.extra.address
              )
                .then(async (foreclosableAddress) => {
                  await createForeclosableAddressTask(
                    res,
                    foreclosableAddress,
                    false
                  );
                })
                .catch((e) => console.log(e));
            }
            res.sendStatus(200);
          },
          _id,
          { extra: { address: task.extra.address, isForeclosable } }
        );
      }
    })
    .catch((e) => next(serverError(e)));
});

router.put(
  "/:deFactoId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { deFactoId, property } = req.params;
    const { propertyValue } = req.body;
    DeFacto.findOneAndUpdate(
      { _id: deFactoId },
      { [property]: propertyValue, lastUpdate: new Date() },
      { new: true }
    )
      .lean()
      .then((deFacto) => {
        NormalAssetModel.find({ parentAssetId: deFacto._id })
          .then((receivedAssets) => {
            res.send({ ...deFacto, receivedAssets });
            createDeFactoTasks(req, res, { ...deFacto, receivedAssets });
          })
          .catch((e) => console.log(e));
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
