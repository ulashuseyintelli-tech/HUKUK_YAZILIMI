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
const { checkRestrictionsStatus } = require("./RestrictionHelper");

const $ = TASK_TYPE;

const createVehicleTasks = (req, res, vehicle) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, vehicle, type),
    (type) => makeTaskCompleted(vehicle, type, _id),
    (type) => cancelTaskBySystem(vehicle, type),
    vehicle,
    ASSET_TYPE.VEHICLE
  );

  // CREATE VEHICLE CASE
  if (!property && !propertyValue) {
    makeQueryEntryTaskCompleted(vehicle, _id);
    createTaskShortcut(res, vehicle, $.IS_SEIZED);
  }

  // SPECIAL CASE: There is three conditions in order to create or cancel custodian info tasks
  if (
    property === "restriction.exist" ||
    property === "restriction.completed" ||
    property === "restriction.isCancelledByThreshold" ||
    property === "claim103Status" ||
    property === "isWarranted"
  ) {
    if (
      checkRestrictionsStatus(vehicle, res.locals.lawOffice) &&
      vehicle.claim103Status === NOTIFICATION_STATUS.DONE &&
      vehicle.isWarranted === true
    ) {
      Task.findOne({
        assetType: ASSET_TYPE.VEHICLE,
        assetId: vehicle._id,
        type: $.CUSTODIAN_INFO_REQUIRED,
        status: TASK_STATUS.PENDING,
      }).then((task) => {
        if (!task) {
          createTaskShortcut(res, vehicle, $.CUSTODIAN_INFO_REQUIRED);
        }
      });
    } else {
      cancelTaskBySystem(vehicle, $.CUSTODIAN_INFO_REQUIRED);
    }
  }

  if (property === "isSeized") {
    makeTaskCompleted(vehicle, $.IS_SEIZED, _id);
    if (propertyValue === false) {
      createTaskShortcut(res, vehicle, $.REASON_FOR_NEGATIVE_REQUIRED);
      cancelTaskBySystem(vehicle, $.RESTRICTIONS_EXIST);
      cancelTaskBySystem(vehicle, $.CLAIM_103_DOCUMENT_CREATE);
      cancelTaskBySystem(vehicle, $.SALE_ADVANCE_REQUIRED);
      cancelTaskBySystem(vehicle, $.WARRANT_REQUIRED);
    } else {
      createTaskShortcut(res, vehicle, $.RESTRICTIONS_EXIST);
      createTaskShortcut(res, vehicle, $.CLAIM_103_DOCUMENT_CREATE);
      createTaskShortcut(res, vehicle, $.SALE_ADVANCE_REQUIRED);
      createTaskShortcut(res, vehicle, $.WARRANT_REQUIRED);
    }
  } else if (property === "reasonForBeingNegative" && propertyValue) {
    makeTaskCompleted(vehicle, $.REASON_FOR_NEGATIVE_REQUIRED, _id);
  } else if (property === "isSaleAdvancePaid" && propertyValue === true) {
    makeTaskCompleted(vehicle, $.SALE_ADVANCE_REQUIRED, _id);
  } else if (property === "isWarranted" && propertyValue === true) {
    makeTaskCompleted(vehicle, $.WARRANT_REQUIRED, _id);
  } else if (property === "claim103DocumentCreated") {
    if (propertyValue === true) {
      createAssetNotification(
        res,
        vehicle,
        ASSET_TYPE.VEHICLE,
        NOTIFICATION_TYPE[103]
      );
      makeTaskCompleted(vehicle, $.CLAIM_103_DOCUMENT_CREATE, _id);
      createTaskShortcut(res, vehicle, $.CLAIM_103_DOCUMENT_STATUS);
    }
  } else if (property === "claim103Status") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      makeTaskCompleted(vehicle, $.CLAIM_103_DOCUMENT_STATUS, _id);
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
    makeTaskCompleted(vehicle, $.CUSTODIAN_INFO_REQUIRED, _id);
    createTaskShortcut(res, vehicle, $.APPRAISAL_DOCUMENT_REQUIRED);
    if (vehicle.restriction.exist === true) {
      createTaskShortcut(res, vehicle, $.CLAIM_100_DOCUMENT_CREATE);
    }
  }
};

const createTaskShortcut = async (res, vehicle, type) => {
  createTask(res, vehicle, {
    assetType: ASSET_TYPE.VEHICLE,
    assetId: vehicle._id,
    type,
  });
};

const makeTaskCompleted = (vehicle, type, userId) => {
  const conditions = {
    assetType: ASSET_TYPE.VEHICLE,
    assetId: vehicle._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (vehicle, type, statusCondition) => {
  const conditions = {
    assetType: ASSET_TYPE.VEHICLE,
    assetId: vehicle._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

module.exports = { createVehicleTasks };
