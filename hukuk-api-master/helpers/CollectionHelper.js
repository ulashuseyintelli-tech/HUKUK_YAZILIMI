const {
  createTask,
  cancelTaskManyBySystem,
  doneTaskMany,
  makeQueryEntryTaskCompleted,
} = require("./TaskHelper");
const {
  TASK_TYPE,
  TASK_STATUS,
  COLLECTION_TYPE,
  SSI_SALARY_TYPE,
} = require("../constants");
const TaskModel = require("../models/TaskModel");
const CommitmentModel = require("../models/CommitmentModel");
const CollectionModel = require("../models/CollectionModel");
const SsiModel = require("../models/SsiModel");
const DeFactoModel = require("../models/DeFactoModel");

const $ = TASK_TYPE;

const handleCollectionTasks = async (req, res, collection) => {
  const { _id } = res.locals.decoded;

  if (
    collection.type === COLLECTION_TYPE.CREDITOR_CASE ||
    collection.type === COLLECTION_TYPE.TAX_DUE ||
    collection.type === COLLECTION_TYPE.BANK ||
    collection.type === COLLECTION_TYPE.SSI ||
    collection.type === COLLECTION_TYPE.DE_FACTO_GARNISHMENT
  ) {
    makeTaskCompleted(collection, $.CREATE_COLLECTION, _id);
    if (collection.type === COLLECTION_TYPE.SSI) {
      handleSsiCollection(res, collection);
    } else if (collection.type === COLLECTION_TYPE.DE_FACTO_GARNISHMENT) {
      handleDeFactoGarnishmentCollection(res, collection);
    }
  } else if (collection.type === COLLECTION_TYPE.SALE) {
    makeTaskCompleted(collection, $.SALE_COLLECTION_REQUIRED, _id);
  } else if (collection.type === COLLECTION_TYPE.COMMITMENT) {
    makeTaskCompleted(collection, $.COMMITMENT_COLLECTION_REQUIRED, _id);
    CommitmentModel.findById(collection.assetId)
      .then((commitment) => {
        CollectionModel.find({ assetId: collection.assetId }).then(
          (collections) => {
            let totalCollection = 0;
            collections.map((c) => (totalCollection += parseFloat(c.amount)));
            if (totalCollection < parseFloat(commitment.totalAmount)) {
              const collDate = new Date(collection.date);
              let nearestDate = new Date(collection.date);
              const laterDates = commitment.calculatedInstallments
                .filter((i) => {
                  const instDate = new Date(i.date);
                  return (
                    instDate > collDate &&
                    !(
                      instDate.getMonth() === collDate.getMonth() &&
                      instDate.getFullYear() === collDate.getFullYear()
                    )
                  );
                })
                .sort((a, b) => a - b);
              if (laterDates.length > 0) {
                nearestDate = new Date(laterDates[0].date);
              } else {
                nearestDate.setMonth(nearestDate.getMonth() + 1);
              }
              createTask(
                res,
                commitment,
                {
                  assetType: "COMMITMENT",
                  assetId: commitment._id,
                  status: TASK_STATUS.FUTURE,
                  type: TASK_TYPE.COMMITMENT_COLLECTION_REQUIRED,
                },
                null,
                nearestDate
              ).catch((e) => console.log(e));
            }
          }
        );
      })
      .catch((e) => console.log(e));
  }
};

const handleSsiCollection = (res, collection) => {
  const { assetId, type, extra } = collection;
  CollectionModel.find({
    type,
    assetId,
    "extra.taskStartDate": extra.taskStartDate,
    "extra.type": { $ne: "GARNISHMENT" },
  }).then((collections) => {
    let total = 0;
    collections.map((c) => (total += parseInt(c.amount)));
    SsiModel.findById(collection.assetId).then((ssi) => {
      const ssiAmount = calculateSsiAmountToCollection(ssi.salaryInfo);
      if (total < ssiAmount) {
        createTaskShortcut(res, collection, $.SSI_MEMORIAL, null, extra);
      } else {
        TaskModel.updateMany(
          {
            assetId,
            type: $.SSI_MEMORIAL,
            "extra.taskStartDate": extra.taskStartDate,
          },
          { status: TASK_STATUS.CANCELLED_BY_SSI_PAY }
        ).exec();
      }
    });
  });
};

const handleDeFactoGarnishmentCollection = (res, collection) => {
  const { assetId, type, extra } = collection;
  CollectionModel.find({
    type,
    assetId,
    "extra.taskStartDate": extra.taskStartDate,
    "extra.type": "GARNISHMENT",
  }).then((collections) => {
    let total = 0;
    collections.map((c) => (total += parseInt(c.amount)));
    DeFactoModel.findById(collection.assetId).then((deFacto) => {
      const ssiAmount = calculateSsiAmountToCollection(
        deFacto.garnishmentDetails
      );
      if (total < ssiAmount) {
        createTaskShortcut(
          res,
          collection,
          $.DE_FACTO_GARNISHMENT_MEMORIAL,
          null,
          extra
        );
      } else {
        TaskModel.updateMany(
          {
            assetId,
            type: $.DE_FACTO_GARNISHMENT_MEMORIAL,
            "extra.taskStartDate": extra.taskStartDate,
          },
          { status: TASK_STATUS.CANCELLED_BY_SSI_PAY }
        ).exec();
      }
    });
  });
};

const createTaskShortcut = async (
  res,
  collection,
  type,
  startDate,
  extra = {}
) => {
  createTask(
    res,
    collection,
    {
      assetType: collection.assetType,
      assetId: collection.assetId,
      type,
      status: startDate ? TASK_STATUS.FUTURE : TASK_STATUS.PENDING,
      extra,
    },
    false,
    startDate
  );
};

const makeTaskCompleted = (collection, type, userId) => {
  const conditions = {
    assetType: collection.assetType,
    assetId: collection.assetId,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (collection, type, statusCondition) => {
  const conditions = {
    assetType: collection.assetType,
    assetId: collection.assetId,
    $or: [{ status: TASK_STATUS.PENDING, status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

const calculateSsiAmountToCollection = (salaryInfo) => {
  if (salaryInfo.type === SSI_SALARY_TYPE.ALL.value) {
    return parseInt(salaryInfo.amount);
  } else if (salaryInfo.type === SSI_SALARY_TYPE.DIRECT.value) {
    return parseInt(salaryInfo.amountToCollection);
  } else if (salaryInfo.type === SSI_SALARY_TYPE.PERCENTAGE.value) {
    return (
      (parseInt(salaryInfo.amount) *
        parseInt(salaryInfo.percentageToCollection)) /
      100
    );
  }
};

module.exports = { handleCollectionTasks };
