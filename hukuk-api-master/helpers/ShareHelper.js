const {
  createTask,
  cancelTaskManyBySystem,
  doneTaskMany,
  makeQueryEntryTaskCompleted,
  checkTaskExistByAssetId,
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
const { makeThirdPersonDebtor } = require("./DebtorHelper");

const $ = TASK_TYPE;

const createShareTasks = (req, res, share) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, share, type),
    (type) => makeTaskCompleted(share, type, _id),
    (type) => cancelTaskBySystem(share, type),
    share,
    ASSET_TYPE.SHARE
  );

  // CREATE SHARE CASE
  if (!property && !propertyValue) {
    makeQueryEntryTaskCompleted(share, _id);
    createTaskShortcut(res, share, $.CREATE_INPOUNDMENT);
  }

  // SPECIAL CASE: There is three conditions in order to create or cancel custodian info tasks
  if (
    property === "restriction.exist" ||
    property === "restriction.table" ||
    property === "restriction.completed" ||
    property === "claim103Status" ||
    property === "chamberOfCommerceNotificationStatus"
  ) {
    if (
      checkRestrictionsStatus(share, res.locals.lawOffice) &&
      share.claim103Status === NOTIFICATION_STATUS.DONE &&
      share.chamberOfCommerceNotificationStatus === NOTIFICATION_STATUS.DONE
    ) {
      checkTaskExistByAssetId(share._id, $.APPRAISAL_DOCUMENT_REQUIRED, [
        TASK_STATUS.DONE,
        TASK_STATUS.PENDING,
        TASK_STATUS.FUTURE,
      ]).then((exist) => {
        if (!exist) {
          createTaskShortcut(res, share, $.APPRAISAL_DOCUMENT_REQUIRED);
        }
      });
      if (share.restriction.exist) {
        checkTaskExistByAssetId(share._id, $.CLAIM_100_DOCUMENT_CREATE, [
          TASK_STATUS.DONE,
          TASK_STATUS.PENDING,
          TASK_STATUS.FUTURE,
        ]).then((exist) => {
          if (!exist) {
            createTaskShortcut(res, share, $.CLAIM_100_DOCUMENT_CREATE);
          }
        });
      }
    } else {
      cancelTaskBySystem(share, $.APPRAISAL_DOCUMENT_REQUIRED);
      cancelTaskBySystem(share, $.CLAIM_100_DOCUMENT_CREATE);
    }
  }

  if (property === "isInpoundmentCreated" && propertyValue === true) {
    createAssetNotification(
      res,
      share,
      ASSET_TYPE.SHARE,
      NOTIFICATION_TYPE.SHARE
    );
    makeTaskCompleted(share, $.CREATE_INPOUNDMENT, _id);
  } else if (property === "inpoundmentNotificationStatus") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, share, $.INPOUNDMENT_RESPONSE);
    }
  } else if (property === "inpoundmentResponse") {
    makeTaskCompleted(share, $.INPOUNDMENT_RESPONSE, _id);
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, share, $.RESTRICTIONS_EXIST);
      createTaskShortcut(res, share, $.CLAIM_103_DOCUMENT_CREATE);
      createTaskShortcut(res, share, $.SALE_ADVANCE_REQUIRED);
      createTaskShortcut(res, share, $.CHAMBER_OF_COMMERCE_DOCUMENT);
    } else {
      if (propertyValue === NOTIFICATION_STATUS.PENDING) {
        createTaskShortcut(res, share, $.INPOUNDMENT_MEMORIAL);
      } else if (propertyValue === NOTIFICATION_STATUS.REJECTED) {
        createTaskShortcut(res, share, $.REASON_FOR_NEGATIVE_REQUIRED);
      }
      cancelTaskBySystem(share, $.RESTRICTIONS_EXIST);
      cancelTaskBySystem(share, $.CLAIM_103_DOCUMENT_CREATE);
      cancelTaskBySystem(share, $.SALE_ADVANCE_REQUIRED);
      cancelTaskBySystem(share, $.CHAMBER_OF_COMMERCE_DOCUMENT);
    }
  } else if (property === "isMemorialCreated" && propertyValue === true) {
    createAssetNotification(
      res,
      share,
      ASSET_TYPE.SHARE,
      NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL
    );
    makeTaskCompleted(share, $.INPOUNDMENT_MEMORIAL, _id);
  } else if (property === "memorialStatus") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, share, $.INPOUNDMENT_MEMORIAL_RESPONSE);
    }
  } else if (property === "memorialResponse") {
    makeTaskCompleted(share, $.INPOUNDMENT_MEMORIAL_RESPONSE, _id);
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, share, $.RESTRICTIONS_EXIST);
      createTaskShortcut(res, share, $.CLAIM_103_DOCUMENT_CREATE);
      createTaskShortcut(res, share, $.SALE_ADVANCE_REQUIRED);
      createTaskShortcut(res, share, $.CHAMBER_OF_COMMERCE_DOCUMENT);
    } else {
      if (propertyValue === NOTIFICATION_STATUS.PENDING) {
        makeThirdPersonDebtor(
          req,
          res,
          share.caseId,
          share.companyId,
          null,
          true
        );
      } else if (propertyValue === NOTIFICATION_STATUS.REJECTED) {
        createTaskShortcut(res, share, $.REASON_FOR_NEGATIVE_REQUIRED);
      }
      cancelTaskBySystem(share, $.RESTRICTIONS_EXIST);
      cancelTaskBySystem(share, $.CLAIM_103_DOCUMENT_CREATE);
      cancelTaskBySystem(share, $.SALE_ADVANCE_REQUIRED);
      cancelTaskBySystem(share, $.CHAMBER_OF_COMMERCE_DOCUMENT);
    }
  } else if (property === "reasonForBeingNegative" && propertyValue) {
    makeTaskCompleted(share, $.REASON_FOR_NEGATIVE_REQUIRED, _id);
  } else if (property === "isSaleAdvancePaid" && propertyValue === true) {
    makeTaskCompleted(share, $.SALE_ADVANCE_REQUIRED, _id);
  } else if (property === "claim103DocumentCreated") {
    if (propertyValue === true) {
      createAssetNotification(
        res,
        share,
        ASSET_TYPE.SHARE,
        NOTIFICATION_TYPE[103]
      );
      makeTaskCompleted(share, $.CLAIM_103_DOCUMENT_CREATE, _id);
      createTaskShortcut(res, share, $.CLAIM_103_DOCUMENT_STATUS);
    }
  } else if (property === "claim103Status") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      makeTaskCompleted(share, $.CLAIM_103_DOCUMENT_STATUS, _id);
    }
  } else if (
    property === "chamberOfCommerceDocumentCreated" &&
    propertyValue === true
  ) {
    makeTaskCompleted(share, $.CHAMBER_OF_COMMERCE_DOCUMENT, _id);
    createAssetNotification(
      res,
      share,
      ASSET_TYPE.SHARE,
      NOTIFICATION_TYPE.CHAMBER_OF_COMMERCE
    );
  } else if (
    property === "chamberOfCommerceNotificationStatus" &&
    propertyValue === NOTIFICATION_STATUS.DONE
  ) {
    makeTaskCompleted(share, $.CHAMBER_OF_COMMERCE_NOTIFICATION, _id);
  }
};

const createTaskShortcut = async (res, share, type) => {
  createTask(res, share, {
    assetType: ASSET_TYPE.SHARE,
    assetId: share._id,
    type,
  });
};

const makeTaskCompleted = (share, type, userId) => {
  const conditions = {
    assetType: ASSET_TYPE.SHARE,
    assetId: share._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (share, type, statusCondition) => {
  const conditions = {
    assetType: ASSET_TYPE.SHARE,
    assetId: share._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

module.exports = { createShareTasks };
