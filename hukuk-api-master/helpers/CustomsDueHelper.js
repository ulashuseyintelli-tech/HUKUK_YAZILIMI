const {
  createTask,
  cancelTaskManyBySystem,
  doneTaskMany,
  makeQueryEntryTaskCompleted,
} = require("./TaskHelper");
const {
  TASK_TYPE,
  TASK_STATUS,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPE,
  ASSET_TYPE,
} = require("../constants");
const { createBeforeSaleTasks } = require("./SaleHelper");
const Task = require("../models/TaskModel");
const { createAssetNotification } = require("../lib/assetLib");
const { createNormalAssetTasks } = require("./NormalAssetHelper");

const $ = TASK_TYPE;

const createCustomsDueTasks = (req, res, customsDue) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, customsDue, type),
    (type) => makeTaskCompleted(customsDue, type, _id),
    (type) => cancelTaskBySystem(customsDue, type),
    customsDue,
    ASSET_TYPE.CUSTOMS
  );

  // CREATE CUSTOMS_DUE CASE
  if (!property && !propertyValue) {
    makeQueryEntryTaskCompleted(customsDue, _id);
    createTaskShortcut(res, customsDue, $.IS_SEIZED);
  }

  if (property === "isSeized") {
    makeTaskCompleted(customsDue, $.IS_SEIZED, _id);
    if (propertyValue === true) {
      createTaskShortcut(res, customsDue, $.CUSTOMS_SEIZE_DE_FACTO_REQUIRED);
    }
  } else if (property === "deFactoSeizeDate") {
    makeTaskCompleted(customsDue, $.CUSTOMS_SEIZE_DE_FACTO_REQUIRED, _id);
    createTaskShortcut(res, customsDue, $.IS_ASSET_RECEIVED);
  } else if (property === "isAssetReceived") {
    makeTaskCompleted(customsDue, $.IS_ASSET_RECEIVED, _id);
    if (propertyValue === true) {
      createTaskShortcut(res, customsDue, $.RECEIVED_ASSETS);
    } else {
      cancelTaskBySystem(customsDue, $.RECEIVED_ASSETS);
      cancelTaskBySystem(customsDue, $.CLAIM_103_DOCUMENT_CREATE);
    }
  } else if (
    property === "allReceivedAssetsEntered" &&
    propertyValue === true
  ) {
    makeTaskCompleted(customsDue, $.RECEIVED_ASSETS, _id);
    Task.findOne({
      assetType: "CUSTOMS",
      assetId: customsDue._id,
      status: TASK_STATUS.PENDING,
      type: $.CLAIM_103_DOCUMENT_CREATE,
    }).then((task) => {
      if (!task) {
        createTaskShortcut(res, customsDue, $.CLAIM_103_DOCUMENT_CREATE);
      }
    });
  } else if (property === "claim103DocumentCreated") {
    if (propertyValue === true) {
      createAssetNotification(
        res,
        customsDue,
        ASSET_TYPE.CUSTOMS,
        NOTIFICATION_TYPE[103]
      );
      makeTaskCompleted(customsDue, $.CLAIM_103_DOCUMENT_CREATE, _id);
      createTaskShortcut(res, customsDue, $.CLAIM_103_DOCUMENT_STATUS);
    }
  } else if (property === "claim103Status") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      makeTaskCompleted(customsDue, $.CLAIM_103_DOCUMENT_STATUS, _id);
      createTaskShortcut(res, customsDue, $.CUSTODIAN_INFO_REQUIRED);
    }
  } else if (
    property === "custodianInfo" &&
    propertyValue.address &&
    propertyValue.name &&
    propertyValue.startDate &&
    propertyValue.dailyPrice
  ) {
    makeTaskCompleted(customsDue, $.CUSTODIAN_INFO_REQUIRED, _id);
  }

  if (property === "custodianInfo" || property === "claim103Status") {
    if (
      customsDue.custodianInfo.address &&
      customsDue.custodianInfo.name &&
      customsDue.custodianInfo.startDate &&
      customsDue.custodianInfo.dailyPrice &&
      customsDue.claim103Status === NOTIFICATION_STATUS.DONE
    ) {
      customsDue.receivedAssets.map((asset) => {
        createNormalAssetTasks(req, res, asset);
      });
    }
  }
};

const createTaskShortcut = async (res, customsDue, type) => {
  createTask(res, customsDue, {
    assetType: "CUSTOMS",
    assetId: customsDue._id,
    type,
  });
};

const makeTaskCompleted = (customsDue, type, userId) => {
  const conditions = {
    assetType: "CUSTOMS",
    assetId: customsDue._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (customsDue, type, statusCondition) => {
  const conditions = {
    assetType: "CUSTOMS",
    assetId: customsDue._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

module.exports = {
  createCustomsDueTasks,
};
