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
  ASSET_TYPE,
  COLLECTION_TYPE,
} = require("../constants");
const { createBeforeSaleTasks } = require("./SaleHelper");
const { checkRestrictionsStatus } = require("./RestrictionHelper");
const CollectionModel = require("../models/CollectionModel");

const $ = TASK_TYPE;

const createTaxDueTasks = (req, res, taxDue) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, taxDue, type),
    (type) => makeTaskCompleted(taxDue, type, _id),
    (type) => cancelTaskBySystem(taxDue, type),
    taxDue,
    ASSET_TYPE.TAX_DUE
  );

  // CREATE TAX DUE CASE
  if (!property && !propertyValue) {
    makeQueryEntryTaskCompleted(taxDue, _id);
    createTaskShortcut(res, taxDue, $.IS_SEIZED);
  }
  if (property === "isSeized") {
    makeTaskCompleted(taxDue, $.IS_SEIZED, _id);
    if (propertyValue === true) {
      createTaskShortcut(res, taxDue, $.RESTRICTIONS_EXIST);
    }
  } else if (
    property === "restriction.exist" ||
    property === "restriction.completed"
  ) {
    if (checkRestrictionsStatus(taxDue, res.locals.lawOffice)) {
      createTaskShortcut(res, taxDue, $.MONEY_REQUEST_REQUIRED);
    } else {
      cancelTaskBySystem(taxDue, $.MONEY_REQUEST_REQUIRED);
    }
  } else if (
    property === "isDueRequestCreated" &&
    checkRestrictionsStatus(taxDue, res.locals.lawOffice)
  ) {
    if (propertyValue === true) {
      makeTaskCompleted(taxDue, $.MONEY_REQUEST_REQUIRED, _id);
      createTaskShortcut(res, taxDue, $.MONEY_REQUEST_RESPONSE);
    } else if (propertyValue === false) {
      cancelTaskBySystem(taxDue, TASK_TYPE.MONEY_REQUEST_RESPONSE);
      createTaskShortcut(res, taxDue, $.MONEY_REQUEST_REQUIRED);
    }
  } else if (property === "dueRequestResponse") {
    makeTaskCompleted(taxDue, $.MONEY_REQUEST_RESPONSE, _id);
    if (propertyValue === true) {
      handleCollection(taxDue);
    } else if (propertyValue === false) {
      deleteLastCollection(taxDue);
    }
  }
};

const createTaskShortcut = async (res, taxDue, type) => {
  createTask(res, taxDue, {
    assetType: ASSET_TYPE.TAX_DUE,
    assetId: taxDue._id,
    type,
  });
};

const makeTaskCompleted = (taxDue, type, userId) => {
  const conditions = {
    assetType: ASSET_TYPE.TAX_DUE,
    assetId: taxDue._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (taxDue, type, statusCondition) => {
  const conditions = {
    assetType: ASSET_TYPE.TAX_DUE,
    assetId: taxDue._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

const handleCollection = async (taxDue) => {
  await deleteLastCollection(taxDue);
  createCollection(taxDue);
};

const createCollection = (taxDue) => {
  return CollectionModel.create({
    type: COLLECTION_TYPE.TAX_DUE,
    payee: "İCRA DOSYASI",
    caseId: taxDue.caseId,
    debtorId: taxDue.debtorId,
    amount: taxDue.dueAmount,
    receivedMoneyCurrency: "TL",
    date: new Date(),
    assetId: taxDue._id,
    assetType: ASSET_TYPE.TAX_DUE,
  });
};

const deleteLastCollection = (taxDue) => {
  return CollectionModel.deleteOne({
    type: COLLECTION_TYPE.TAX_DUE,
    assetId: taxDue._id,
    assetType: ASSET_TYPE.TAX_DUE,
  }).exec();
};

module.exports = { createTaxDueTasks };
