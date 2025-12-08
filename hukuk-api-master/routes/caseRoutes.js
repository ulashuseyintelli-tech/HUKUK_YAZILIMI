const express = require("express"),
  Case = require("../models/CaseModel"),
  router = express.Router();

const mongoose = require("mongoose");
const {
  CASE_TYPES_NEEDS_WRIT,
  ASSET_TYPE,
  DEBTOR_TYPE,
  CASE_TYPES_WITHOUT_DUE,
  EXPENSE_TYPE,
} = require("../constants");
const { createCaseTasks } = require("../helpers/CaseHelper");
const {
  cancelAllTasksByCase,
  handleDebtorTasks,
} = require("../helpers/DebtorHelper");

const { serverError } = require("../helpers/ErrorHelper");
const { getNotificationExpanditure } = require("../helpers/NotificationHelper");
const {
  findRestrictionNotifications,
} = require("../helpers/RestrictionHelper");
const Middlewares = require("../middlewares/Middlewares");
const CustomsDueModel = require("../models/CustomsDueModel");
const DebtorModel = require("../models/DebtorModel");
const DeFactoModel = require("../models/DeFactoModel");
const ExecutionOffice = require("../models/ExecutionOffice");
const ExpenseModel = require("../models/ExpenseModel");
const ForeclosableAddressModel = require("../models/ForeclosableAddressModel");
const LawOfficeModel = require("../models/LawOfficeModel");
const NotificationModel = require("../models/NotificationModel");
const SaleModel = require("../models/SaleModel");
const VehicleModel = require("../models/VehicleModel");

router.get("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Case.find({ lawOfficeId })
    .sort("-updatedAt")
    .then((cases) => {
      res.send(cases);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/:number", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Case.findOne({ number: req.params.number, lawOfficeId })
    .then((doc) => {
      res.send(doc);
    })
    .catch((e) => next(serverError(e)));
});

router.get(
  "/:caseId/expanditure/expense",
  Middlewares.verifyToken,
  async (req, res, next) => {
    const { caseId } = req.params;
    ExpenseModel.find({ caseId })
      .then((expenses) => {
        let officialExpanditure = 0;
        let unofficialExpanditure = 0;
        const officialList = expenses
          .filter((exp) => exp.type === EXPENSE_TYPE.OFFICIAL)
          .map((exp) => {
            officialExpanditure += exp.amount;
            return {
              startDate: exp.date,
              expanditure: exp.amount,
              title: exp.title,
              description: exp.description,
              assetType: exp.assetType,
            };
          });
        const unofficialList = expenses
          .filter((exp) => exp.type === EXPENSE_TYPE.UNOFFICIAL)
          .map((exp) => {
            unofficialExpanditure += exp.amount;
            return {
              startDate: exp.date,
              expanditure: exp.amount,
              title: exp.title,
              description: exp.description,
              assetType: exp.assetType,
            };
          });
        res.send({
          officialExpanditure,
          unofficialExpanditure,
          officialList,
          unofficialList,
        });
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/expanditure/notification",
  Middlewares.verifyToken,
  async (req, res, next) => {
    const { caseId } = req.params;
    let expanditure = 0;
    await findRestrictionNotifications(caseId).then((assetArrays) => {
      assetArrays.map((arr) => {
        arr.map((asset) => {
          asset.restriction.table.map((item) => {
            if (
              !item.withoutCreditor &&
              item.notifications &&
              item.notifications.length > 0
            ) {
              item.notifications
                .filter((n) => n.barcodeNumber)
                .map((not) => {
                  expanditure += getNotificationExpanditure(not);
                });
            }
          });
        });
      });
    });
    NotificationModel.find({
      caseId,
      $and: [
        { barcodeNumber: { $ne: null } },
        { barcodeNumber: { $ne: "" } },
        { barcodeNumber: { $ne: undefined } },
      ],
    })
      .then((nots) => {
        const list = [];
        nots.map((n) => {
          expanditure += getNotificationExpanditure(n);
          list.push({
            startDate: n.createdAt,
            expanditure: getNotificationExpanditure(n),
          });
        });
        res.send({ expanditure: parseInt(expanditure).toFixed(2), list });
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/expanditure/custodianInfo",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId } = req.params;
    ForeclosableAddressModel.find({ caseId })
      .then((addresses) => {
        let expanditure = 0;
        const list = [];
        Promise.all([
          CustomsDueModel.find({ caseId }),
          VehicleModel.find({ caseId }),
          DeFactoModel.find({
            foreclosableAddressId: { $in: addresses.map((a) => a._id) },
          }),
        ])
          .then(async (docsList) => {
            const ids = [];
            docsList.map((arr) => arr.map((item) => ids.push(item._id)));
            await SaleModel.aggregate([
              {
                $match: {
                  assetId: { $in: ids },
                  $expr: [
                    {
                      $or: [
                        { assetType: ASSET_TYPE.CUSTOMS },
                        { assetType: ASSET_TYPE.DE_FACTO },
                        { assetType: ASSET_TYPE.VEHICLE },
                        { assetType: ASSET_TYPE.PLEDGED_MOVABLE },
                      ],
                    },
                  ],
                },
              },
              {
                $lookup: {
                  from: "salerequests",
                  localField: "_id",
                  foreignField: "saleId",
                  as: "saleRequests",
                },
              },
            ]).then((sales) => {
              docsList.map((docs) => {
                docs.map((doc) => {
                  if (
                    doc.custodianInfo &&
                    doc.custodianInfo.startDate &&
                    doc.custodianInfo.dailyPrice
                  ) {
                    if (
                      !isNaN(parseInt(doc.custodianInfo.dailyPrice)) &&
                      new Date(doc.custodianInfo.startDate) < new Date()
                    ) {
                      let custodianInfoEndDate = new Date();
                      const sale = sales.find(
                        (item) => `${item.assetId}` === `${doc._id}`
                      );
                      if (sale) {
                        if (sale.isSoldByAnotherCreditor) {
                          if (sale.dateOfSoldByAnotherCreditor) {
                            custodianInfoEndDate = new Date(
                              sale.dateOfSoldByAnotherCreditor
                            );
                          }
                        } else if (sale.saleRequests.length > 0) {
                          const lastSaleRequest =
                            sale.saleRequests[sale.saleRequests.length - 1];
                          const successfullSaleDay = lastSaleRequest.days.find(
                            (d) => d.saleStatus
                          );
                          if (successfullSaleDay) {
                            custodianInfoEndDate = new Date(
                              successfullSaleDay.saleDate
                            );
                          }
                        }
                      }
                      const days = Math.floor(
                        (custodianInfoEndDate -
                          new Date(doc.custodianInfo.startDate)) /
                          86400000
                      );
                      const exp = days * parseInt(doc.custodianInfo.dailyPrice);
                      list.push({
                        startDate: doc.custodianInfo.startDate,
                        endDate: new Date(),
                        dailyPrice: doc.custodianInfo.dailyPrice,
                        expanditure: exp,
                      });
                      expanditure += exp;
                    }
                  }
                });
              });
            });

            res.send({ expanditure: parseInt(expanditure).toFixed(2), list });
          })
          .catch((e) => {
            next(serverError());
            console.log(e);
          });
      })
      .catch((e) => next(serverError()));
  }
);

router.get("/:number/details", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { caseId } = req.query;
  try {
    let matchObject = {
      lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
    };
    if (req.params.number !== "undefined") {
      matchObject.number = parseInt(req.params.number);
    } else {
      matchObject._id = mongoose.Types.ObjectId(caseId);
    }
    Case.aggregate([
      {
        $match: matchObject,
      },
      {
        $lookup: {
          from: "executionoffices",
          localField: "executionOfficeId",
          foreignField: "_id",
          as: "executionOffice",
        },
      },
      {
        $lookup: {
          from: "clients",
          localField: "clientIds",
          foreignField: "_id",
          as: "clients",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "lawyerIds",
          foreignField: "_id",
          as: "lawyers",
        },
      },
      {
        $lookup: {
          from: "debtors",
          let: { debtorIds: `$debtorIds` },
          pipeline: [
            {
              $match: {
                $expr: [
                  {
                    $in: [`$_id`, `$$debtorIds`],
                  },
                  { $or: [{ isThirdPerson: false }, { isBecameDebtor: true }] },
                ],
              },
            },
            {
              $lookup: {
                from: "notifications",
                let: { debtorId: `$_id` },
                pipeline: [
                  {
                    $match: {
                      assetType: undefined,
                      $expr: {
                        $eq: [`$debtorId`, `$$debtorId`],
                      },
                    },
                  },
                ],
                as: "notifications",
              },
            },
          ],
          as: "debtors",
        },
      },
      {
        $lookup: {
          from: "debtors",
          let: { debtorIds: `$debtorIds` },
          pipeline: [
            {
              $match: {
                isThirdPerson: true,
                lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
              },
            },
            {
              $lookup: {
                from: "notifications",
                let: { debtorId: `$_id` },
                pipeline: [
                  {
                    $match: {
                      assetType: undefined,
                      $expr: {
                        $eq: [`$debtorId`, `$$debtorId`],
                      },
                    },
                  },
                ],
                as: "notifications",
              },
            },
          ],
          as: "thirdPersons",
        },
      },
      {
        $lookup: {
          from: "dues",
          localField: "dueIds",
          foreignField: "_id",
          as: "dues",
        },
      },
      {
        $lookup: {
          from: "payments",
          localField: "paymentIds",
          foreignField: "_id",
          as: "payments",
        },
      },
      {
        $lookup: {
          from: "collections",
          localField: "_id",
          foreignField: "caseId",
          as: "collections",
        },
      },
      {
        $lookup: {
          from: "expenses",
          localField: "_id",
          foreignField: "caseId",
          as: "expenses",
        },
      },
    ])
      .then((currentCase) => {
        res.send(currentCase[0]);
      })
      .catch((e) => next(serverError(e)));
  } catch (e) {
    next(serverError(e));
  }
});

router.put("/:number", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Case.findOneAndUpdate({ number: req.params.number, lawOfficeId }, req.body, {
    new: true,
  })
    .then((doc) => {
      res.send(doc);
      createCaseTasks(req, res, doc);
    })
    .catch((e) => next(serverError(e)));
});

router.put("/:number/addDebtor", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { number } = req.params;
  const { debtorId } = req.body;
  Case.findOneAndUpdate(
    { number, lawOfficeId },
    { $push: { debtorIds: debtorId } },
    { new: true }
  )
    .then((doc) => {
      res.send(doc);
      DebtorModel.findById(debtorId)
        .then((debtor) => {
          handleDebtorTasks(req, res, doc._id, debtor, true);
        })
        .catch((e) => {
          console.log(e);
        });
    })
    .catch((e) => next(serverError(e)));
});

router.put(
  "/:number/removeDebtor",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { lawOfficeId } = res.locals.decoded;
    const { number } = req.params;
    const { debtorId } = req.body;
    Case.findOneAndUpdate(
      { number, lawOfficeId },
      { $pull: { debtorIds: debtorId } },
      { new: true }
    )
      .then((doc) => {
        cancelAllTasksByCase({ caseId: doc._id, debtorId });
        res.send(doc);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:number/complete/details",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { lawOfficeId } = res.locals.decoded;
    const { number } = req.params;
    const { date, executionFileNumber, status } = req.body;
    Case.findOne({ number, lawOfficeId })
      .then((currentCase) => {
        if (!currentCase.executionOfficeId) {
          LawOfficeModel.findById(lawOfficeId)
            .then((lawOffice) => {
              ExecutionOffice.findOne({
                name: "Nöbetçi İcra Dairesi",
                city: lawOffice.address.city,
                lawOfficeId,
              }).then(async (executionOffice) => {
                if (!executionOffice) {
                  await ExecutionOffice.create({
                    name: "Nöbetçi İcra Dairesi",
                    city: lawOffice.address.city,
                    lawOfficeId,
                  })
                    .then((doc) => {
                      executionOffice = doc;
                    })
                    .catch((e) => next(serverError(e)));
                }
                Case.findOneAndUpdate(
                  {
                    number,
                    lawOfficeId,
                  },
                  {
                    date,
                    executionFileNumber,
                    status,
                    executionOfficeId: executionOffice._id,
                    isDetailsCompleted: true,
                  },
                  { new: true }
                )
                  .then((doc) => {
                    res.send(doc);
                  })
                  .catch((e) => next(serverError(e)));
              });
            })
            .catch((e) => next(serverError(e)));
        } else {
          Case.findOneAndUpdate(
            { number, lawOfficeId },
            { date, executionFileNumber, status, isDetailsCompleted: true },
            { new: true }
          )
            .then((doc) => {
              res.send(doc);
            })
            .catch((e) => next(serverError(e)));
        }
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:number/complete/executionOffice",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { lawOfficeId } = res.locals.decoded;
    const { number } = req.params;
    const { executionOfficeId } = req.body;
    Case.findOneAndUpdate(
      { number, lawOfficeId },
      { executionOfficeId, isExecutionOfficeCompleted: true },
      { new: true }
    )
      .then((doc) => {
        res.send(doc);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:number/complete/clients",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { lawOfficeId } = res.locals.decoded;
    const { number } = req.params;
    const { clientIds } = req.body;
    Case.findOneAndUpdate(
      { number, lawOfficeId },
      { clientIds, isClientsCompleted: true },
      { new: true }
    )
      .then((doc) => {
        res.send(doc);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:number/complete/debtors",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { lawOfficeId } = res.locals.decoded;
    const { number } = req.params;
    Case.findOneAndUpdate(
      { number, lawOfficeId },
      { isDebtorsCompleted: true },
      { new: true }
    )
      .then((doc) => {
        res.send(doc);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put(
  "/:number/complete/dues",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { lawOfficeId } = res.locals.decoded;
    const { number } = req.params;
    const { dueIds } = req.body;
    Case.findOneAndUpdate(
      { number, lawOfficeId },
      { dueIds, isDuesCompleted: true },
      { new: true }
    )
      .then((doc) => {
        res.send(doc);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.put("/:number/:property", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { number, property } = req.params;
  const { propertyValue } = req.body;
  Case.findOneAndUpdate(
    { number, lawOfficeId },
    { [property]: propertyValue },
    { new: true }
  )
    .then((doc) => {
      res.send(doc);
      createCaseTasks(req, res, doc);
    })
    .catch((e) => next(serverError(e)));
});

router.post("/", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { type } = req.body;
  Case.count({ lawOfficeId })
    .then((value) => {
      Case.create({
        number: value + 1,
        lawOfficeId,
        ...req.body,
        isWritDetailsCompleted: CASE_TYPES_NEEDS_WRIT.includes(type)
          ? false
          : true,
        isDuesCompleted: CASE_TYPES_WITHOUT_DUE.includes(type),
        isChildrenCompleted: type === "3" ? false : true,
        isHypotecInfoCompleted:
          type === "8" || type === "6" || type === "9" ? false : true,
        isRentalDetailsCompleted: type === "13" || type === "14" ? false : true,
      })
        .then((doc) => {
          res.send(doc);
          createCaseTasks(req, res, doc);
        })
        .catch((e) => next(serverError(e)));
    })
    .catch((e) => next(serverError(e)));
});
module.exports = router;
