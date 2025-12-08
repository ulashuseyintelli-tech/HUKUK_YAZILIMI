const {
  TASK_TYPE,
  TASK_STATUS,
  NOTIFICATION_STATUS,
  ASSET_TYPE,
} = require("../constants");
const { getAssetModelByType } = require("../lib/assetLib");
const { createBeforeSaleTasks } = require("./SaleHelper");
const { doneTaskMany, createTask } = require("./TaskHelper");

const $ = TASK_TYPE;

const createNormalAssetTasks = (req, res, normalAsset) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, normalAsset, type),
    (type) => makeTaskCompleted(normalAsset, type, _id),
    (type) => cancelTaskBySystem(normalAsset, type),
    normalAsset,
    ASSET_TYPE.NORMAL_ASSET
  );

  if (!property && !propertyValue) {
    if (normalAsset.parentAssetId) {
      getAssetModelByType(normalAsset.parentAssetType)
        .findById(normalAsset.parentAssetId)
        .then((parentAsset) => {
          if (
            normalAsset.parentAssetType === ASSET_TYPE.DE_FACTO
              ? parentAsset.isDebtorExist ||
                parentAsset.is103LeftToPlace ||
                parentAsset.claim103Status === NOTIFICATION_STATUS.DONE
              : parentAsset.claim103Status === NOTIFICATION_STATUS.DONE
          ) {
            if (normalAsset.restriction.exist === true) {
              createTaskShortcut(res, normalAsset, $.CLAIM_100_DOCUMENT_CREATE);
              if (!normalAsset.appraisalResult) {
                createTaskShortcut(
                  res,
                  normalAsset,
                  $.APPRAISAL_DOCUMENT_REQUIRED
                );
              }
            } else if (normalAsset.restriction.exist === false) {
              if (!normalAsset.appraisalResult) {
                createTaskShortcut(
                  res,
                  normalAsset,
                  $.APPRAISAL_DOCUMENT_REQUIRED
                );
              } else {
                createTaskShortcut(
                  res,
                  normalAsset,
                  $.APPRAISAL_NOTIFICATION_REQUIRED
                );
              }
            }
          }
        });
    }
  }

  if (property === "custodianInfo" && propertyValue) {
    if (normalAsset.restriction.exist === true) {
      createTaskShortcut(res, normalAsset, $.CLAIM_100_DOCUMENT_CREATE);
      if (!normalAsset.appraisalResult) {
        createTaskShortcut(res, normalAsset, $.APPRAISAL_DOCUMENT_REQUIRED);
      }
    } else if (normalAsset.restriction.exist === false) {
      if (!normalAsset.appraisalResult) {
        createTaskShortcut(res, normalAsset, $.APPRAISAL_DOCUMENT_REQUIRED);
      } else {
        createTaskShortcut(res, normalAsset, $.APPRAISAL_NOTIFICATION_REQUIRED);
      }
    }
  }
};

const createTaskShortcut = async (res, normalAsset, type, startDate) => {
  const creationObject = {
    assetType: ASSET_TYPE.NORMAL_ASSET,
    assetId: normalAsset._id,
    type,
    status: startDate ? TASK_STATUS.FUTURE : TASK_STATUS.PENDING,
  };
  if (normalAsset.parentAssetType) {
    creationObject.parentAssetType = normalAsset.parentAssetType;
  }
  if (normalAsset.parentAssetId) {
    creationObject.parentAssetId = normalAsset.parentAssetId;
  }
  createTask(res, normalAsset, creationObject, false, startDate);
};

const makeTaskCompleted = (normalAsset, type, userId) => {
  const conditions = {
    assetType: ASSET_TYPE.NORMAL_ASSET,
    assetId: normalAsset._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

module.exports = { createNormalAssetTasks };
