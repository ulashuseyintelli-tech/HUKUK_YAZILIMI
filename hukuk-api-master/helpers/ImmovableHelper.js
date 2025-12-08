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
const { createAssetNotification } = require("../lib/assetLib");
const { checkRestrictionsStatus } = require("./RestrictionHelper");

const $ = TASK_TYPE;

const createImmovableTasks = (req, res, immovable) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, immovable, type),
    (type) => makeTaskCompleted(immovable, type, _id),
    (type) => cancelTaskBySystem(immovable, type),
    immovable,
    ASSET_TYPE.IMMOVABLE
  );

  // CREATE IMMOVABLE CASE
  if (!property && !propertyValue) {
    makeQueryEntryTaskCompleted(immovable, _id);
    createTaskShortcut(res, immovable, $.IS_SEIZED);
  }

  // SPECIAL CASE: There is two conditions in order to create or cancel appraisal result tasks
  if (
    property === "restriction.exist" ||
    property === "restriction.table" ||
    property === "restriction.completed" ||
    property === "claim103Status" ||
    property === "zoningStatusNotificationStatus" ||
    property === "cadastreNotificationStatus"
  ) {
    if (
      checkRestrictionsStatus(immovable, res.locals.lawOffice) &&
      immovable.claim103Status === NOTIFICATION_STATUS.DONE &&
      immovable.zoningStatusNotificationStatus === NOTIFICATION_STATUS.DONE &&
      immovable.cadastreNotificationStatus === NOTIFICATION_STATUS.DONE
    ) {
      checkTaskExistByAssetId(
        immovable._id,
        $.APPRAISAL_DOCUMENT_REQUIRED,
        NOTIFICATION_STATUS.DONE
      )
        .then((exist) => {
          if (!exist) {
            createTaskShortcut(res, immovable, $.APPRAISAL_DOCUMENT_REQUIRED);
          }
        })
        .catch((e) => console.log(e));
      if (immovable.restriction.exist) {
        checkTaskExistByAssetId(
          immovable._id,
          $.CLAIM_100_DOCUMENT_CREATE,
          NOTIFICATION_STATUS.DONE
        )
          .then((exist) => {
            if (!exist) {
              createTaskShortcut(res, immovable, $.CLAIM_100_DOCUMENT_CREATE);
            }
          })
          .catch((e) => console.log(e));
      }
    } else {
      cancelTaskBySystem(immovable, $.APPRAISAL_DOCUMENT_REQUIRED);
      cancelTaskBySystem(immovable, $.CLAIM_100_DOCUMENT_CREATE);
    }
  }

  if (property === "isSeized") {
    makeTaskCompleted(immovable, $.IS_SEIZED, _id);
    if (immovable.isSeized === true) {
      createTaskShortcut(res, immovable, $.RESTRICTIONS_EXIST);
      createTaskShortcut(res, immovable, $.CLAIM_103_DOCUMENT_CREATE);
      createTaskShortcut(res, immovable, $.SALE_ADVANCE_REQUIRED);
      createTaskShortcut(res, immovable, $.ZONING_STATUS_DOCUMENT_CREATE);
      createTaskShortcut(res, immovable, $.CADASTRE_DOCUMENT_CREATE);
      cancelTaskBySystem(immovable, $.REASON_FOR_NEGATIVE_REQUIRED);
    } else if (immovable.isSeized === false) {
      createTaskShortcut(res, immovable, $.REASON_FOR_NEGATIVE_REQUIRED);
      cancelTaskBySystem(immovable, $.RESTRICTIONS_EXIST);
      cancelTaskBySystem(immovable, $.CLAIM_103_DOCUMENT_CREATE);
      cancelTaskBySystem(immovable, $.SALE_ADVANCE_REQUIRED);
      cancelTaskBySystem(immovable, $.ZONING_STATUS_ANSWER);
      cancelTaskBySystem(immovable, $.CADASTRE_ANSWER);
    }
  }

  if (property === "reasonForBeingNegative" && propertyValue) {
    makeTaskCompleted(immovable, $.REASON_FOR_NEGATIVE_REQUIRED, _id);
  } else if (property === "claim103DocumentCreated") {
    if (propertyValue === true) {
      createAssetNotification(
        res,
        immovable,
        ASSET_TYPE.IMMOVABLE,
        NOTIFICATION_TYPE[103]
      );
      makeTaskCompleted(immovable, $.CLAIM_103_DOCUMENT_CREATE, _id);
      createTaskShortcut(res, immovable, $.CLAIM_103_DOCUMENT_STATUS);
    }
  } else if (property === "claim103Status") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      makeTaskCompleted(immovable, $.CLAIM_103_DOCUMENT_STATUS, _id);
    }
  } else if (property === "isSaleAdvancePaid" && propertyValue === true) {
    makeTaskCompleted(immovable, $.SALE_ADVANCE_REQUIRED, _id);
  } else if (
    property === "isZoningStatusDocumentCreated" &&
    propertyValue === true
  ) {
    createAssetNotification(
      res,
      immovable,
      ASSET_TYPE.IMMOVABLE,
      NOTIFICATION_TYPE.ZONING_STATUS
    );
    makeTaskCompleted(immovable, $.ZONING_STATUS_DOCUMENT_CREATE);
    createTaskShortcut(res, immovable, $.ZONING_STATUS_ANSWER);
  } else if (
    property === "isCadastreDocumentCreated" &&
    propertyValue === true
  ) {
    createAssetNotification(
      res,
      immovable,
      ASSET_TYPE.IMMOVABLE,
      NOTIFICATION_TYPE.CADASTRE
    );
    makeTaskCompleted(immovable, $.CADASTRE_DOCUMENT_CREATE);
    createTaskShortcut(res, immovable, $.CADASTRE_ANSWER);
  } else if (
    property === "zoningStatusNotificationStatus" &&
    propertyValue === NOTIFICATION_STATUS.DONE
  ) {
    makeTaskCompleted(immovable, $.ZONING_STATUS_ANSWER, _id);
  } else if (
    property === "cadastreNotificationStatus" &&
    propertyValue === NOTIFICATION_STATUS.DONE
  ) {
    makeTaskCompleted(immovable, $.CADASTRE_ANSWER, _id);
  }
};

const createTaskShortcut = async (res, immovable, type, extra = {}) => {
  createTask(res, immovable, {
    assetType: ASSET_TYPE.IMMOVABLE,
    assetId: immovable._id,
    type,
    extra: { ...extra },
  });
};

const makeTaskCompleted = (immovable, type, userId) => {
  const conditions = {
    assetType: ASSET_TYPE.IMMOVABLE,
    assetId: immovable._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (immovable, type, statusCondition) => {
  const conditions = {
    assetType: "IMMOVABLE",
    assetId: immovable._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

module.exports = { createImmovableTasks };
