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
  COLLECTION_TYPE,
} = require("../constants");
const { createAssetNotification } = require("../lib/assetLib");
const CollectionModel = require("../models/CollectionModel");

const $ = TASK_TYPE;

const createCreditorCaseTasks = (req, res, creditorCase) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  if (!property && !propertyValue) {
    makeQueryEntryTaskCompleted(creditorCase, _id);
    createTaskShortcut(res, creditorCase, $.IS_SEIZED);
  }

  if (property === "isSeized") {
    makeTaskCompleted(creditorCase, $.IS_SEIZED, _id);
    if (propertyValue === true) {
      createTaskShortcut(res, creditorCase, $.CLAIM_103_DOCUMENT_CREATE);
    }
  } else if (property === "claim103DocumentCreated") {
    if (propertyValue === true) {
      createAssetNotification(
        res,
        creditorCase,
        "CREDITOR_CASE",
        NOTIFICATION_TYPE[103]
      );
      makeTaskCompleted(creditorCase, $.CLAIM_103_DOCUMENT_CREATE, _id);
      createTaskShortcut(res, creditorCase, $.CLAIM_103_DOCUMENT_STATUS);
    }
  } else if (property === "claim103Status") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      makeTaskCompleted(creditorCase, $.CLAIM_103_DOCUMENT_STATUS, _id);
      createTaskShortcut(res, creditorCase, $.CREDITOR_CASE_THIRD_PERSON_WARN);
    }
  } else if (property === "isThirdPersonWarned") {
    if (propertyValue === true) {
      makeTaskCompleted(creditorCase, $.CREDITOR_CASE_THIRD_PERSON_WARN, _id);
      createTaskShortcut(res, creditorCase, $.CREDITOR_CASE_INCOME_CHECK);
    }
  } else if (property === "isPaid") {
    makeTaskCompleted(creditorCase, $.CREDITOR_CASE_INCOME_CHECK, _id);
    if (propertyValue === true) {
      handleCollection(creditorCase);
      cancelTaskBySystem(creditorCase, $.MAKE_THIRD_PERSON_DEBTOR);
    } else if (propertyValue === false) {
      createTaskShortcut(res, creditorCase, $.MAKE_THIRD_PERSON_DEBTOR);
      deleteLastCollection(creditorCase);
    }
  }
};

const createTaskShortcut = async (res, creditorCase, type) => {
  createTask(res, creditorCase, {
    assetType: "CREDITOR_CASE",
    assetId: creditorCase._id,
    type,
  });
};

const makeTaskCompleted = (creditorCase, type, userId) => {
  const conditions = {
    assetType: "CREDITOR_CASE",
    assetId: creditorCase._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (creditorCase, type, statusCondition) => {
  const conditions = {
    assetType: "CREDITOR_CASE",
    assetId: creditorCase._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

const handleCollection = async (creditorCase) => {
  await deleteLastCollection(creditorCase);
  createCollection(creditorCase);
};

const createCollection = (creditorCase) => {
  return CollectionModel.create({
    type: COLLECTION_TYPE.CREDITOR_CASE,
    payee: "İCRA DOSYASI",
    caseId: creditorCase.caseId,
    debtorId: creditorCase.debtorId,
    amount: creditorCase.dueAmount,
    receivedMoneyCurrency: "TL",
    date: new Date(),
    assetId: creditorCase._id,
    assetType: "CREDITOR_CASE",
  });
};

const deleteLastCollection = (creditorCase) => {
  return CollectionModel.deleteOne({
    type: COLLECTION_TYPE.CREDITOR_CASE,
    assetId: creditorCase._id,
    assetType: "CREDITOR_CASE",
  }).exec();
};

module.exports = { createCreditorCaseTasks };
