const {
  createTask,
  doneTaskMany,
  cancelTaskManyBySystem,
  doneFutureTask,
} = require("./TaskHelper");
const Sale = require("../models/SaleModel");
const Task = require("../models/TaskModel");
const {
  TASK_TYPE,
  NOTIFICATION_STATUS,
  TASK_STATUS,
  COLLECTION_TYPE,
  NOTIFICATION_TYPE,
  ASSET_TYPE,
} = require("../constants");
const ForeclosableAddress = require("../models/ForeclosableAddressModel");
const {
  getAssetModelByType,
  createAssetNotification,
} = require("../lib/assetLib");
const CollectionModel = require("../models/CollectionModel");

const $ = TASK_TYPE;

const createBeforeSaleTasks = (
  req,
  res,
  create,
  complete,
  cancel,
  object,
  assetType
) => {
  const { property } = req.params;
  const { propertyValue } = req.body;

  const prop = property;
  const val = propertyValue;

  if (prop === "appraisalResultDocumentCreated" && val === true) {
    complete($.APPRAISAL_DOCUMENT_REQUIRED);
    create($.APPRAISAL_RESULT_REQUIRED);
  } else if (
    (prop === "appraisalResult" ||
      prop === "claim100DocumentCreated" ||
      prop === "garnishmentClaim100Created") &&
    val
  ) {
    if (prop === "appraisalResult") {
      complete($.APPRAISAL_RESULT_REQUIRED);
    } else if (prop === "claim100DocumentCreated") {
      complete($.CLAIM_100_DOCUMENT_CREATE);
    } else if (prop === "garnishmentClaim100Created") {
      complete($.GARNISHMENT_CLAIM_100_DOCUMENT_CREATE);
    }
    if (
      (object.appraisalResult ||
        assetType === ASSET_TYPE.SSI ||
        prop === "garnishmentClaim100Created") &&
      (object.claim100DocumentCreated ||
        (prop === "garnishmentClaim100Created" &&
          object.garnishmentClaim100Created)) &&
      object.restriction.exist
    ) {
      if (prop === "garnishmentClaim100Created") {
        create($.GARNISHMENT_CLAIM_100_DOCUMENT_STATUS);
      } else {
        create($.CLAIM_100_DOCUMENT_STATUS);
      }
    } else if (object.appraisalResult && object.restriction.exist === false) {
      create($.APPRAISAL_NOTIFICATION_REQUIRED);
    }
  } else if (prop === "appraisalNotificationCreated" && val) {
    complete($.APPRAISAL_NOTIFICATION_REQUIRED);
    create($.APPRAISAL_NOTIFICATION_DONE_REQUIRED);
    createAssetNotification(
      res,
      object,
      assetType,
      NOTIFICATION_TYPE.APPRAISAL_RESULT
    );
  }
};

const createSaleRequestTasks = (req, res, request) => {
  Sale.findById(request.saleId)
    .then((sale) => {
      createSaleTasks(req, res, sale, request);
    })
    .catch((e) => console.log(e));
};

const createSaleTasks = (req, res, sale, request) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue, dayProperty, dayPropertyValue, dayIndex } = req.body;

  const create = (type) => createTaskShortcut(res, sale, type);
  const complete = (type) => makeTaskCompleted(sale, type, _id);
  const cancel = (type) => cancelTaskBySystem(sale, type);

  if (property === "isSoldByAnotherCreditor") {
    complete($.SALE_SOLD_BY_ANOTHER_CREDITOR);
    if (propertyValue === true) {
      create($.SALE_DETAILS);
      cancel($.SALE_REQUEST_REQUIRED);
    } else {
      cancel($.SALE_DETAILS);
      create($.SALE_REQUEST_REQUIRED);
    }
  } else if (property === "isSaleRequested" && propertyValue === true) {
    complete($.SALE_REQUEST_REQUIRED);
    create($.SALE_REQUEST_DAY_DATES_REQUIRED);
    if (sale.assetType === "VEHICLE" || sale.assetType === "IMMOVABLE") {
      create($.RESTRICTIONS_UPDATE_REQUIRED);
    }
  } else if (
    property === "saleAmount" ||
    property === "boughtByUs" ||
    property === "shareAmount" ||
    property === "dateOfSoldByAnotherCreditor"
  ) {
    if (
      sale.dateOfSoldByAnotherCreditor &&
      sale.saleAmount &&
      sale.boughtByUs !== null &&
      (sale.shareAmount || sale.shareAmount === 0)
    ) {
      complete($.SALE_DETAILS);
      create($.SALE_MONEY_INCOME_REQUIRED);
    }
  }

  if (property === "days") {
    Task.find({
      assetType: sale.assetType,
      assetId: sale.assetId,
      type: $.SALE_REQUEST_DAY_RESPONSE,
      "extra.dayIndex": dayIndex,
    })
      .then((task) => {})
      .catch((e) => console.log(e));
    if (request.days.every((d) => d.saleDate)) {
      makeTaskCompleted(sale, $.SALE_REQUEST_DAY_DATES_REQUIRED, _id);
    }
    if (dayIndex !== 0) {
      makeFutureTaskCompleted(sale, $.SALE_REQUEST_SECOND_DAY_REQUIRED, _id, {
        "extra.dayIndex": 1,
      });
    }
    if (dayProperty === "isSaleAnnouncedAtNewspaper" && propertyValue) {
      makeTaskCompleted(
        sale,
        $.SALE_REQUEST_DAY_NEWSPAPER_ANNOUNCE_REQUIRED,
        _id
      );
    }
    // else if(dayProperty === "address" && dayPropertyValue.city && dayPropertyValue.district && dayPropertyValue.description){

    // }
    if (
      dayProperty === "saleDate" &&
      dayPropertyValue &&
      (dayIndex === 0 ||
        (dayIndex === 1 && request.days[0].saleStatus === false))
    ) {
      Task.findOne({
        assetType: sale.assetType,
        assetId: sale.assetId,
        $or: [
          { type: $.SALE_REQUEST_DAY_RESPONSE },
          { type: $.SALE_REQUEST_SECOND_DAY_REQUIRED },
        ],
        "extra.dayIndex": dayIndex,
      }).then((task) => {
        if (task) {
          Task.deleteOne({ _id: task._id })
            .then(() => {})
            .catch((e) => console.log(e));
        }
        if (
          res.locals.lawOffice.saleNewspaperMandatoryAssetTypes.includes(
            sale.assetType
          ) &&
          !request.days[dayIndex].isSaleAnnouncedAtNewspaper
        ) {
          createTaskShortcut(
            res,
            sale,
            $.SALE_REQUEST_DAY_NEWSPAPER_ANNOUNCE_REQUIRED,
            { extra: { dayIndex } }
          );
        }
        createTaskShortcut(
          res,
          sale,
          dayIndex === 0
            ? $.SALE_REQUEST_DAY_RESPONSE
            : $.SALE_REQUEST_SECOND_DAY_REQUIRED,
          {
            status:
              new Date(dayPropertyValue) > new Date()
                ? TASK_STATUS.FUTURE
                : TASK_STATUS.PENDING,
            extra: { dayIndex },
          },
          dayPropertyValue
        );
      });
    }
    if (dayProperty === "saleStatus") {
      makeTaskCompleted(
        sale,
        dayIndex === 0
          ? $.SALE_REQUEST_DAY_RESPONSE
          : $.SALE_REQUEST_SECOND_DAY_REQUIRED,
        _id,
        {
          "extra.dayIndex": dayIndex,
        }
      );
      if (dayPropertyValue === false) {
        createTaskShortcut(res, sale, $.SALE_REQUEST_DAY_REASON_FOR_NEGATIVE);
        cancelTaskBySystem(
          sale,
          $.SALE_REQUEST_COMPLETED_NOTIFICATION_REQUIRED
        );
        if (dayIndex === 0) {
          Task.findOne({
            assetType: sale.assetType,
            assetId: sale.assetId,
            type: $.SALE_REQUEST_SECOND_DAY_REQUIRED,
          }).then((task) => {
            if (task) {
              Task.deleteOne({ _id: task._id })
                .then(() => {})
                .catch((e) => console.log(e));
            }
            createTaskShortcut(
              res,
              sale,
              $.SALE_REQUEST_SECOND_DAY_REQUIRED,
              {
                status: TASK_STATUS.FUTURE,
                extra: { dayIndex },
              },
              new Date(request.days[1].saleDate)
            );
          });
        } else {
          createTaskShortcut(res, sale, $.NEW_SALE_REQUEST_REQUIRED);
        }
      } else if (dayPropertyValue === true) {
        if (dayIndex === 0) {
          Task.updateMany(
            {
              assetType: sale.assetType,
              assetId: sale.assetId,
              type: $.SALE_REQUEST_SECOND_DAY_REQUIRED,
            },
            { status: TASK_STATUS.CANCELLED_BY_SYSTEM }
          ).catch((e) => console.log(e));
        }
        cancelTaskBySystem(sale, $.SALE_REQUEST_DAY_REASON_FOR_NEGATIVE);
        createTaskShortcut(
          res,
          sale,
          $.SALE_REQUEST_COMPLETED_NOTIFICATION_REQUIRED,
          { extra: { dayIndex } }
        );
      }
    } else if (dayProperty === "saleNotificationStatus") {
      if (dayPropertyValue === NOTIFICATION_STATUS.DONE) {
        makeTaskCompleted(
          sale,
          $.SALE_REQUEST_COMPLETED_NOTIFICATION_REQUIRED,
          _id
        );
        createIfTaskDoesNotExist(sale, $.SALE_DETAILS, res);
      } else {
        cancelTaskBySystem(sale, $.SALE_DETAILS);
      }
    } else if (dayProperty === "reasonForBeingNegative") {
      makeTaskCompleted(sale, $.SALE_REQUEST_DAY_REASON_FOR_NEGATIVE, _id);
    }
  } else if (property === "isMoneyTaken") {
    if (propertyValue === true) {
      makeTaskCompleted(sale, $.SALE_MONEY_INCOME_REQUIRED, _id);
      if (sale.shareAmount) {
        handleSaleCollection(sale);
      }
    } else if (propertyValue === false) {
      Task.findOne({
        assetType: sale.assetType,
        assetId: sale.assetId,
        type: $.SALE_MONEY_INCOME_REQUIRED,
        status: TASK_STATUS.PENDING,
      }).then((task) => {
        if (!task) {
          createTaskShortcut(res, sale, $.SALE_MONEY_INCOME_REQUIRED);
        }
      });
      cancelTaskBySystem(sale, $.SALE_COLLECTION_REQUIRED);
    }
  }
};

const createTaskShortcut = async (res, sale, type, data, startDate) => {
  const { assetType, assetId } = sale;
  let model = getAssetModelByType(assetType);
  model.findById(assetId).then(async (asset) => {
    if (model.modelName === "DeFacto") {
      await ForeclosableAddress.findById(asset.foreclosableAddressId)
        .then((address) => {
          createTask(res, address, { assetType, assetId, type });
        })
        .catch((e) => console.log(e));
    } else {
      createTask(
        res,
        asset,
        { assetType, assetId, type, ...data },
        false,
        startDate
      );
    }
  });
};

const makeTaskCompleted = (sale, type, userId, extra = {}) => {
  return doneTaskMany(
    {
      assetType: sale.assetType,
      assetId: sale.assetId,
      status: TASK_STATUS.PENDING,
      type,
      ...extra,
    },
    () => {},
    userId
  );
};

const makeFutureTaskCompleted = (sale, type, userId, conditions = {}) => {
  return doneFutureTask(
    {
      assetType: sale.assetType,
      assetId: sale.assetId,
      type,
      ...conditions,
    },
    () => {},
    userId
  );
};

const cancelTaskBySystem = (sale, type, statusCondition) => {
  const conditions = {
    assetType: sale.assetType,
    assetId: sale.assetId,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

const createIfTaskDoesNotExist = (sale, type, res) => {
  Task.findOne({
    assetId: sale.assetId,
    assetType: sale.assetType,
    type,
    status: TASK_STATUS.PENDING,
  })
    .then((task) => {
      if (!task) {
        createTaskShortcut(res, sale, type);
      }
    })
    .catch((e) => {
      console.log(e);
      //TODO: Kayıt tutulmalı oluşmadığına dahil
    });
};

const handleSaleCollection = async (sale) => {
  await deleteLastSaleCollection(sale);
  createSaleCollection(sale);
};

const createSaleCollection = async (sale) => {
  await getAssetModelByType(sale.assetType)
    .findById(sale.assetId)
    .then(async (asset) => {
      await CollectionModel.create({
        type: COLLECTION_TYPE.SALE,
        payee: "İCRA DOSYASI",
        caseId: asset.caseId,
        debtorId: asset.debtorId,
        amount: sale.shareAmount,
        receivedMoneyCurrency: "TL",
        date: new Date(),
        assetId: sale.assetId,
        assetType: sale.assetType,
      });
    });
};

const deleteLastSaleCollection = async (sale) => {
  return CollectionModel.deleteOne({
    type: COLLECTION_TYPE.SALE,
    assetId: sale.assetId,
    assetType: sale.assetType,
  }).exec();
};

module.exports = {
  createSaleRequestTasks,
  createSaleTasks,
  createBeforeSaleTasks,
};
