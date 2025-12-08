const {
  TASK_TYPE,
  TASK_STATUS,
  DEBTOR_TYPE,
  NOTIFICATION_STATUS,
  ASSET_TYPE,
  NOTIFICATION_TYPE,
} = require("../constants");
const { getAssetModelByType } = require("../lib/assetLib");
const BankQueryModel = require("../models/BankQueryModel");
const CreditorModel = require("../models/CreditorModel");
const DeFactoModel = require("../models/DeFactoModel");
const ForeclosableAddressModel = require("../models/ForeclosableAddressModel");
const ImmovableModel = require("../models/ImmovableModel");
const NormalAssetModel = require("../models/NormalAssetModel");
const NotificationModel = require("../models/NotificationModel");
const PatentModel = require("../models/PatentModel");
const ShareModel = require("../models/ShareModel");
const SsiModel = require("../models/SsiModel");
const TaskModel = require("../models/TaskModel");
const TaxDueModel = require("../models/TaxDueModel");
const VehicleModel = require("../models/VehicleModel");
const { check103ObjectionDate, checkObjectionDate } = require("./CaseHelper");
const {
  doneTaskMany,
  cancelTaskManyBySystem,
  createTask,
} = require("./TaskHelper");

const $ = TASK_TYPE;

const checkRestrictionsStatus = (asset, lawOffice, assetType) => {
  return (
    asset.restriction.exist === false ||
    (asset.restriction.table.length > 0 &&
      asset.restriction.completed &&
      (asset.restriction.table.length < lawOffice.restrictionThreshold ||
        asset.restriction.isCancelledByThreshold === false))
  );
};

const handleRestrictionTasks = async (req, res, asset, assetType) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;
  let create = () => {};
  if (assetType === ASSET_TYPE.DE_FACTO) {
    await ForeclosableAddressModel.findById(asset.foreclosableAddressId)
      .then((foreclosableAddress) => {
        create = (type) =>
          newTask(res, foreclosableAddress, type, assetType, asset._id);
      })
      .catch((e) => console.log(e));
  } else {
    create = (type) => newTask(res, asset, type, assetType);
  }
  const cancel = (type) => cancelTask(asset, type);
  const done = (type) => doneTask(asset, type, _id);
  if (property === "exist") {
    done($.RESTRICTIONS_EXIST);
    if (propertyValue === true) {
      create($.RESTRICTIONS_COUNT);
    } else if (propertyValue === false) {
      cancel($.RESTRICTIONS_COUNT);
    }
  } else if (property === "count" && propertyValue) {
    done($.RESTRICTIONS_COUNT);
    if (parseInt(propertyValue) >= res.locals.lawOffice.restrictionThreshold) {
      create($.RESTRICTIONS_CANCELLED_ASSET);
    } else {
      create($.RESTRICTIONS_REQUIRED);
      create($.RESTRICTIONS_COMPLETED);
    }
  } else if (property === "isCancelledByThreshold") {
    done($.RESTRICTIONS_CANCELLED_ASSET);
    if (propertyValue === true) {
      cancelAllAssetTasksByRestrictionThreshold(asset._id);
    } else if (propertyValue === false) {
      create($.RESTRICTIONS_REQUIRED);
      create($.RESTRICTIONS_COMPLETED);
    }
  } else if (property === "completed" || property === "table") {
    if (asset.restriction.table.length > 0 && asset.restriction.completed) {
      done($.RESTRICTIONS_REQUIRED);
      done($.RESTRICTIONS_COMPLETED);
    }
    if (property === "table") {
      if (
        asset.claim100Status !== NOTIFICATION_STATUS.DONE &&
        asset.restriction.completed
      ) {
        checkRestrictionTable100Status(asset.restriction.table)
          .then((status) => {
            if (status === true) {
              done($.CLAIM_100_DOCUMENT_STATUS);
              if (
                assetType !== ASSET_TYPE.BANK &&
                assetType !== ASSET_TYPE.TAX_DUE &&
                assetType !== ASSET_TYPE.SSI &&
                assetType !== ASSET_TYPE.DE_FACTO
              ) {
                checkTaskExist(
                  asset._id,
                  TASK_TYPE.APPRAISAL_NOTIFICATION_REQUIRED
                )
                  .then((exist) => {
                    if (!exist) {
                      create($.APPRAISAL_NOTIFICATION_REQUIRED);
                      getAssetModelByType(assetType)
                        .updateOne(
                          { _id: asset._id },
                          { claim100Status: NOTIFICATION_STATUS.DONE }
                        )
                        .then(() => {
                          if (assetType === ASSET_TYPE.NORMAL_ASSET) {
                            checkParentAsset100Status(asset);
                          }
                        })
                        .catch((e) => console.log(e));
                    }
                  })
                  .catch((e) => console.log(e));
              } else {
                if (
                  assetType === ASSET_TYPE.BANK ||
                  assetType === ASSET_TYPE.TAX_DUE
                ) {
                  checkTaskExist(asset._id, TASK_TYPE.MONEY_REQUEST_REQUIRED)
                    .then((exist) => {
                      if (!exist) {
                        create($.MONEY_REQUEST_REQUIRED);
                        getAssetModelByType(assetType)
                          .updateOne(
                            { _id: asset._id },
                            { claim100Status: NOTIFICATION_STATUS.DONE }
                          )
                          .catch((e) => console.log(e));
                      }
                    })
                    .catch((e) => console.log(e));
                } else if (assetType === ASSET_TYPE.SSI) {
                  checkTaskExist(
                    asset._id,
                    TASK_TYPE.SSI_INPOUNDMENT_SALARY_AMOUNT
                  ).then((exist) => {
                    if (!exist) {
                      create($.SSI_INPOUNDMENT_SALARY_AMOUNT);
                      getAssetModelByType(assetType)
                        .updateOne(
                          { _id: asset._id },
                          { claim100Status: NOTIFICATION_STATUS.DONE }
                        )
                        .catch((e) => console.log(e));
                    }
                  });
                } else if (assetType === ASSET_TYPE.DE_FACTO) {
                  checkTaskExist(
                    asset._id,
                    TASK_TYPE.DE_FACTO_GARNISHMENT_SALARY_INFO
                  ).then((exist) => {
                    if (!exist) {
                      create($.DE_FACTO_GARNISHMENT_SALARY_INFO);
                      getAssetModelByType(assetType)
                        .updateOne(
                          { _id: asset._id },
                          {
                            garnishmentClaim100Status: NOTIFICATION_STATUS.DONE,
                          }
                        )
                        .catch((e) => console.log(e));
                    }
                  });
                }
              }
            }
          })
          .catch((e) => console.log(e)); //TODO: Handle
      } else if (
        asset.claim100Status === NOTIFICATION_STATUS.DONE &&
        asset.appraisalNotificationCreated
      ) {
        handleRestrictionTableAppraisalStatus(res, asset, assetType);
      }
    }
  } else if (property === "updated") {
    if (propertyValue === true) {
      done($.RESTRICTIONS_UPDATE_REQUIRED);
    }
  }
};

const checkRestrictionTable100Status = (table) => {
  const creditorIds = table
    .filter((t) => t.isContinue && !t.withoutCreditor)
    .map((item) => item.creditorId);
  return new Promise((resolve, reject) => {
    if (
      table.some(
        (item) =>
          (!item.withoutCreditor && !item.creditorId) ||
          !item.debtAmount ||
          (!item.withoutCreditor && !item.claim100Status)
      )
    ) {
      resolve(false);
    } else {
      CreditorModel.find({ _id: { $in: creditorIds } })
        .then((creditors) => {
          resolve(
            creditors.every(
              (c) =>
                c.addresses.length > 0 &&
                (c.type === DEBTOR_TYPE.INSTITUTION
                  ? c.taxNumber
                  : c.identityNumber)
            )
          );
        })
        .catch((e) => reject(e));
    }
  });
};

const checkParentAsset100Status = (normalAsset) => {
  NormalAssetModel.find({ parentAssetId: normalAsset.parentAssetId })
    .then((normalAssets) => {
      if (
        normalAssets.every(
          (na) =>
            na.restriction.exist === false ||
            na.claim100Status === NOTIFICATION_STATUS.DONE
        )
      ) {
        getAssetModelByType(normalAsset.parentAssetType)
          .updateOne(
            { _id: normalAsset.parentAssetId },
            { claim100Status: NOTIFICATION_STATUS.DONE }
          )
          .then(() => {
            TaskModel.updateMany(
              {
                assetId: normalAsset.parentAssetId,
                type: $.CLAIM_100_DOCUMENT_STATUS,
              },
              { status: TASK_STATUS.DONE }
            ).catch((e) => console.log(e));
          })
          .catch((e) => console.log(e));
      }
    })
    .catch((e) => console.log(e));
};

const handleRestrictionTableAppraisalStatus = (res, asset, assetType) => {
  checkRestrictionTableAppraisalStatus(asset)
    .then((status) => {
      if (status) {
        TaskModel.updateMany(
          {
            assetId: asset._id,
            type: $.APPRAISAL_NOTIFICATION_DONE_REQUIRED,
          },
          { status: TASK_STATUS.DONE }
        ).catch((e) => console.log(e));
        getAssetModelByType(assetType)
          .updateOne(
            { _id: asset._id },
            { appraisalNotificationStatus: NOTIFICATION_STATUS.DONE }
          )
          .then(() => {
            if (assetType !== ASSET_TYPE.NORMAL_ASSET) {
              checkTaskExist(asset._id, $.SALE_SOLD_BY_ANOTHER_CREDITOR).then(
                (exist) => {
                  if (!exist) {
                    newTask(
                      res,
                      asset,
                      $.SALE_SOLD_BY_ANOTHER_CREDITOR,
                      assetType
                    );
                  }
                }
              );
            } else {
              checkParentAppraisalStatus(res, asset);
            }
          })
          .catch((e) => console.log(e));
      }
    })
    .catch((e) => console.log(e)); //TODO: handle
};

const checkRestrictionTableAppraisalStatus = (asset) => {
  return new Promise((resolve, reject) => {
    NotificationModel.findOne({
      type: NOTIFICATION_TYPE.APPRAISAL_RESULT,
      assetId: asset._id,
      status: NOTIFICATION_STATUS.DONE,
    })
      .then((notification) => {
        console.log({ notification });
        if (!notification) {
          resolve(false);
        } else {
          const { table } = asset.restriction;
          resolve(
            checkObjectionDate(notification, 7) &&
              table
                .filter((t) => t.isContinue && !t.withoutCreditor)
                .every((item) => {
                  let isCompleted = false;
                  if (item.notifications) {
                    if (
                      item.notifications.some((not) =>
                        check103ObjectionDate(not)
                      )
                    ) {
                      isCompleted = true;
                    }
                  }
                  return isCompleted;
                })
          );
        }
      })
      .catch((e) => reject(e));
  });
};

const checkParentAppraisalStatus = (res, normalAsset) => {
  NormalAssetModel.find({ parentAssetId: normalAsset.parentAssetId })
    .then((normalAssets) => {
      if (
        normalAssets.every(
          (na) => na.appraisalNotificationStatus === NOTIFICATION_STATUS.DONE
        )
      ) {
        getAssetModelByType(normalAsset.parentAssetType)
          .findOneAndUpdate(
            { _id: normalAsset.parentAssetId },
            { appraisalNotificationStatus: NOTIFICATION_STATUS.DONE },
            { new: true }
          )
          .then((parentAsset) => {
            newTask(
              res,
              parentAsset,
              $.SALE_SOLD_BY_ANOTHER_CREDITOR,
              normalAsset.parentAssetType
            );
            TaskModel.updateMany(
              {
                assetId: normalAsset.parentAssetId,
                type: $.APPRAISAL_NOTIFICATION_DONE_REQUIRED,
              },
              { status: TASK_STATUS.DONE }
            ).catch((e) => console.log(e));
          })
          .catch((e) => console.log(e));
      }
    })
    .catch((e) => console.log(e));
};

const cancelAllAssetTasksByRestrictionThreshold = (assetId) => {
  TaskModel.updateMany(
    {
      status: { $ne: TASK_STATUS.DONE },
      $or: [{ assetId }, { "extra.notificationAssetId": assetId }],
    },
    { status: TASK_STATUS.CANCELLED_BY_RESTRICTIONS_THRESHOLD }
  ).exec();
};

const prepareTaskConditions = (asset, type) => {
  return {
    assetId: asset._id,
    type,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
  };
};

const newTask = (res, firstLevelObject, taskType, assetType, customAssetId) => {
  createTask(
    res,
    firstLevelObject,
    {
      assetType,
      assetId: customAssetId || firstLevelObject._id,
      type: taskType,
    },
    false
  ).catch((e) => console.log({ e }));
};

const cancelTask = (asset, type) => {
  return cancelTaskManyBySystem(prepareTaskConditions(asset, type));
};

const doneTask = (asset, type, userId) => {
  return doneTaskMany(prepareTaskConditions(asset, type), () => {}, userId);
};

const checkTaskExist = (
  assetId,
  type,
  status = NOTIFICATION_STATUS.PENDING
) => {
  return TaskModel.exists({ assetId, type, status });
};

const findRestrictionNotifications = (caseId) => {
  const findObject = {
    caseId,
    "restriction.table.notifications": { $type: "array" },
  };
  return new Promise((resolve, reject) => {
    Promise.all([
      VehicleModel.find(findObject),
      BankQueryModel.find(findObject),
      DeFactoModel.find(findObject),
      ImmovableModel.find(findObject),
      NormalAssetModel.find(findObject),
      PatentModel.find(findObject),
      ShareModel.find(findObject),
      SsiModel.find(findObject),
      TaxDueModel.find(findObject),
    ])
      .then((arrays) => {
        resolve(arrays);
      })
      .catch((e) => {
        reject(e);
      });
  });
};

module.exports = {
  checkRestrictionsStatus,
  handleRestrictionTasks,
  handleRestrictionTableAppraisalStatus,
  findRestrictionNotifications,
};
