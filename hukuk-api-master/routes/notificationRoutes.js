const express = require("express"),
  Notification = require("../models/NotificationModel"),
  router = express.Router();

const mongoose = require("mongoose");
const { serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const { handleNotificationTasks } = require("../helpers/NotificationHelper");
const constants = require("../constants");
const { NOTIFICATION_TYPE, NOTIFICATION_STATUS } = require("../constants");

// Notification.find({
//   caseId: "60d79a5f6e345c76d96b1622",
//   debtorId: "6072cfbe6fa44e12a4583773",
//   $and: [
//     { barcodeNumber: { $ne: null } },
//     { barcodeNumber: { $ne: "" } },
//     { barcodeNumber: { $ne: undefined } },
//   ],
// }).then((nots) => {
//   Notification.updateOne(
//     {
//       _id: nots[3]._id,
//     },
//     { createdAt: new Date("2021-06-2") }
//   ).exec();
// });

router.post(
  "/:caseId/:debtorId/:type",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId, type } = req.params;
    const { address, assetType, assetId, level } = req.body;
    const bodyObject = {
      address,
      caseId,
      debtorId,
      type,
      status: constants.NOTIFICATION_STATUS.PENDING,
    };
    if (assetType) bodyObject.assetType = assetType;
    if (assetId) bodyObject.assetId = assetId;
    const findObject = { type, debtorId, caseId };
    if (assetType) findObject.assetType = assetType;
    if (assetId) findObject.assetId = assetId;
    Notification.find(findObject)
      .then((nots) => {
        bodyObject.level = level || nots.length + 1;
        Notification.create(bodyObject)
          .then((notification) => {
            res.send(notification);
            handleNotificationTasks(req, res, notification);
          })
          .catch((e) => next(serverError(e)));
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  `/:caseId/${NOTIFICATION_TYPE.CASE_INITIALIZATION}`,
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId } = req.params;
    Notification.aggregate([
      {
        $match: {
          caseId: mongoose.Types.ObjectId(caseId),
          type: NOTIFICATION_TYPE.CASE_INITIALIZATION,
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
      .then((nots) => {
        nots.map((not) => {
          not.debtor = not.debtor[0];
        });
        res.send(nots);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  `/byId/:notificationId`,
  Middlewares.verifyToken,
  (req, res, next) => {
    const { notificationId } = req.params;
    Notification.aggregate([
      {
        $match: {
          _id: mongoose.Types.ObjectId(notificationId),
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
      .then((nots) => {
        nots.map((not) => {
          not.debtor = not.debtor[0];
        });
        res.send(nots[0]);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:type/:caseId/:debtorId/:assetType/:assetId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { type, caseId, debtorId, assetType, assetId } = req.params;
    const findObject = { caseId, debtorId };
    if (assetType !== "undefined") findObject.assetType = assetType;
    if (assetId !== "undefined") findObject.assetId = assetId;
    if (
      (assetId !== "undefined" || assetType !== "undefined") &&
      type !== NOTIFICATION_TYPE.SSI_MEMORIAL &&
      type !== NOTIFICATION_TYPE.DE_FACTO_GARNISHMENT_MEMORIAL
    ) {
      findObject.$or = [
        { type },
        { type: NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL },
      ];
    } else {
      findObject.type = type;
    }
    Notification.find(findObject)
      .then((nots) => {
        res.send(nots);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:notificationId/:property",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { notificationId, property } = req.params;
    const { propertyValue } = req.body;
    Notification.findById(notificationId)
      .then((not) => {
        Notification.findOneAndUpdate(
          { _id: notificationId },
          { [property]: propertyValue },
          {
            new: true,
          }
        )
          .then((notification) => {
            res.send(notification);
            handleNotificationTasks(req, res, notification);
          })
          .catch((e) => next(serverError(e)));
      })
      .catch((e) => next(serverError(e)));
  }
);

module.exports = router;
