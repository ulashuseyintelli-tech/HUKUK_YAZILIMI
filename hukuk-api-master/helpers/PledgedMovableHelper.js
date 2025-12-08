const {
  createTask,
  cancelTaskManyBySystem,
  doneTaskMany,
} = require("./TaskHelper");
const { TASK_TYPE, TASK_STATUS, ASSET_TYPE } = require("../constants");
const { createBeforeSaleTasks } = require("./SaleHelper");
const Task = require("../models/TaskModel");
const { checkRestrictionsStatus } = require("./RestrictionHelper");

const $ = TASK_TYPE;

const createPledgedMovableTasks = (req, res, asset) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, asset, type),
    (type) => makeTaskCompleted(asset, type, _id),
    (type) => cancelTaskBySystem(asset, type),
    asset,
    ASSET_TYPE.PLEDGED_MOVABLE
  );
  console.log({
    resStatus: checkRestrictionsStatus(asset, res.locals.lawOffice),
    property,
  });
  if (
    property === "restriction.exist" ||
    property === "restriction.completed" ||
    property === "restriction.isCancelledByThreshold"
  ) {
    if (checkRestrictionsStatus(asset, res.locals.lawOffice)) {
      Task.findOne({
        assetType: ASSET_TYPE.PLEDGED_MOVABLE,
        assetId: asset._id,
        type: $.CUSTODIAN_INFO_REQUIRED,
        status: TASK_STATUS.PENDING,
      }).then((task) => {
        console.log({ task });
        if (!task) {
          createTaskShortcut(res, asset, $.CUSTODIAN_INFO_REQUIRED);
        }
      });
    } else {
      cancelTaskBySystem(asset, $.CUSTODIAN_INFO_REQUIRED);
    }
  } else if (
    property === "custodianInfo" &&
    propertyValue.address &&
    propertyValue.address !== "" &&
    propertyValue.name &&
    propertyValue.name !== "" &&
    propertyValue.startDate &&
    (propertyValue.dailyPrice || propertyValue.dailyPrice === 0)
  ) {
    makeTaskCompleted(asset, $.CUSTODIAN_INFO_REQUIRED, _id);
    createTaskShortcut(res, asset, $.APPRAISAL_DOCUMENT_REQUIRED);
    if (asset.restriction.exist === true) {
      createTaskShortcut(res, asset, $.CLAIM_100_DOCUMENT_CREATE);
    }
  }
};

const createTaskShortcut = async (res, asset, type) => {
  createTask(res, asset, {
    assetType: ASSET_TYPE.PLEDGED_MOVABLE,
    assetId: asset._id,
    type,
  });
};

const makeTaskCompleted = (asset, type, userId) => {
  const conditions = {
    assetType: ASSET_TYPE.PLEDGED_MOVABLE,
    assetId: asset._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (asset, type, statusCondition) => {
  const conditions = {
    assetType: ASSET_TYPE.PLEDGED_MOVABLE,
    assetId: asset._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

module.exports = {
  createPledgedMovableTasks,
};
