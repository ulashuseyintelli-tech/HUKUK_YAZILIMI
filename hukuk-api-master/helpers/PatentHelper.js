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
const TaskModel = require("../models/TaskModel");
const { createAssetNotification } = require("../lib/assetLib");
const { checkRestrictionsStatus } = require("./RestrictionHelper");

const $ = TASK_TYPE;

const createPatentTasks = (req, res, patent) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, patent, type),
    (type) => makeTaskCompleted(patent, type, _id),
    (type) => cancelTaskBySystem(patent, type),
    patent,
    ASSET_TYPE.PATENT
  );

  // CREATE SHARE CASE
  if (!property && !propertyValue) {
    makeQueryEntryTaskCompleted(patent, _id);
    createTaskShortcut(res, patent, $.IS_SEIZED);
  }

  // SPECIAL CASE: There is three conditions in order to create or cancel custodian info tasks
  if (
    property === "restriction.exist" ||
    property === "restriction.table" ||
    property === "restriction.completed" ||
    property === "claim103Status"
  ) {
    if (
      checkRestrictionsStatus(patent, res.locals.lawOffice) &&
      patent.claim103Status === NOTIFICATION_STATUS.DONE
    ) {
      TaskModel.findOne({
        assetType: ASSET_TYPE.PATENT,
        assetId: patent._id,
        type: $.APPRAISAL_DOCUMENT_REQUIRED,
        status: TASK_STATUS.PENDING,
      }).then((task) => {
        if (!task) {
          createTaskShortcut(res, patent, $.APPRAISAL_DOCUMENT_REQUIRED);
        }
      });
    } else {
      cancelTaskBySystem(patent, $.APPRAISAL_DOCUMENT_REQUIRED);
    }
  }

  if (property === "isSeized") {
    makeTaskCompleted(patent, $.IS_SEIZED, _id);
    if (propertyValue === false) {
      createTaskShortcut(res, patent, $.REASON_FOR_NEGATIVE_REQUIRED);
      cancelTaskBySystem(patent, $.RESTRICTIONS_EXIST);
      cancelTaskBySystem(patent, $.CLAIM_103_DOCUMENT_CREATE);
      cancelTaskBySystem(patent, $.SALE_ADVANCE_REQUIRED);
    } else {
      createTaskShortcut(res, patent, $.RESTRICTIONS_EXIST);
      createTaskShortcut(res, patent, $.CLAIM_103_DOCUMENT_CREATE);
      createTaskShortcut(res, patent, $.SALE_ADVANCE_REQUIRED);
      cancelTaskBySystem(res, patent, $.REASON_FOR_NEGATIVE_REQUIRED);
    }
  } else if (property === "reasonForBeingNegative" && propertyValue) {
    makeTaskCompleted(patent, $.REASON_FOR_NEGATIVE_REQUIRED, _id);
  } else if (property === "isSaleAdvancePaid" && propertyValue === true) {
    makeTaskCompleted(patent, $.SALE_ADVANCE_REQUIRED, _id);
  } else if (property === "claim103DocumentCreated") {
    if (propertyValue === true) {
      createAssetNotification(
        res,
        patent,
        ASSET_TYPE.PATENT,
        NOTIFICATION_TYPE[103]
      );
      makeTaskCompleted(patent, $.CLAIM_103_DOCUMENT_CREATE, _id);
      createTaskShortcut(res, patent, $.CLAIM_103_DOCUMENT_STATUS);
    }
  } else if (property === "claim103Status") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      makeTaskCompleted(patent, $.CLAIM_103_DOCUMENT_STATUS, _id);
    }
  }
};

const createTaskShortcut = async (res, patent, type) => {
  createTask(res, patent, {
    assetType: ASSET_TYPE.PATENT,
    assetId: patent._id,
    type,
  });
};

const makeTaskCompleted = (patent, type, userId) => {
  const conditions = {
    assetType: ASSET_TYPE.PATENT,
    assetId: patent._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (patent, type, statusCondition) => {
  const conditions = {
    assetType: ASSET_TYPE.PATENT,
    assetId: patent._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

module.exports = { createPatentTasks };
