const {
  createTask,
  cancelTaskManyBySystem,
  doneTaskMany,
  makeQueryEntryTaskCompleted,
  checkTaskExistByAssetId,
} = require("./TaskHelper");
const {
  TASK_STATUS,
  TASK_TYPE,
  DEBTOR_TYPE,
  THIRD_PERSON_REASONS,
  COLLECTION_TYPE,
  NOTIFICATION_TYPE,
  ASSET_TYPE,
  NOTIFICATION_STATUS,
} = require("../constants");

const $ = TASK_TYPE;

const LawOfficeModel = require("../models/LawOfficeModel");
const { checkRestrictionsStatus } = require("./RestrictionHelper");
const DebtorModel = require("../models/DebtorModel");
const CaseModel = require("../models/CaseModel");
const CollectionModel = require("../models/CollectionModel");
const TaskModel = require("../models/TaskModel");
const { createAssetNotification } = require("../lib/assetLib");

const createBankTasks = (req, res, bankQuery) => {
  const { _id, lawOfficeId } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;
  const { caseId, debtorId } = bankQuery;
  const bankAddress = {
    title: bankQuery.bankName,
    description: bankQuery.bankName,
    city: bankQuery.bankName,
    district: bankQuery.bankName,
  };

  if (!property && !propertyValue) {
    makeQueryEntryTaskCompleted(bankQuery, _id);
    createTaskShortcut(res, bankQuery, $.BANK_ACCOUNT_EXIST);
  }

  if (property === "isAccountExist") {
    makeTaskCompleted(bankQuery, $.BANK_ACCOUNT_EXIST, _id);
    if (propertyValue === false) {
      LawOfficeModel.findById(lawOfficeId)
        .then((office) => {
          if (office) {
            const now = new Date();
            now.setDate(
              now.getDate() + office.queryReminderDays.BANK_ACCOUNT_EXIST
            );
            createTaskShortcut(res, bankQuery, $.BANK_ACCOUNT_EXIST, now);
          }
        })
        .catch((e) => console.log(e));
    } else if (propertyValue === true) {
      createTaskShortcut(res, bankQuery, $.BANK_ACCOUNT_BALANCE);
    }
  } else if (property === "accountBalance") {
    makeTaskCompleted(bankQuery, $.BANK_ACCOUNT_BALANCE, _id);
    if (
      parseInt(propertyValue) <=
      res.locals.lawOffice.bankAccountBalanceThreshold
    ) {
      createTaskShortcut(
        res,
        bankQuery,
        $.BANK_ACCOUNT_BALANCE_CANCELLED_ASSET
      );
    } else if (propertyValue !== 0) {
      createTaskShortcut(res, bankQuery, $.RESTRICTIONS_NOTIFICATION_REQUIRED);
    }
    if (propertyValue === 0) {
      const now = new Date();
      now.setDate(now.getDate() + office.queryReminderDays.BANK_ACCOUNT_EXIST);
      createTaskShortcut(res, bankQuery, $.BANK_ACCOUNT_BALANCE, now);
    }
  } else if (property === "isCancelledByThreshold") {
    if (propertyValue === true || propertyValue === false) {
      makeTaskCompleted(bankQuery, $.BANK_ACCOUNT_BALANCE_CANCELLED_ASSET, _id);
      if (propertyValue === true) {
        cancelAllAssetTasksByBankAccountBalanceThreshold(bankQuery._id);
      } else if (propertyValue === false) {
        createTaskShortcut(
          res,
          bankQuery,
          $.RESTRICTIONS_NOTIFICATION_REQUIRED
        );
      }
    }
  } else if (
    property === "restrictionsNotificationCreated" &&
    propertyValue === true
  ) {
    createAssetNotification(
      res,
      bankQuery,
      ASSET_TYPE.BANK,
      NOTIFICATION_TYPE.THIRD_PERSON,
      null,
      bankAddress
    );
    makeTaskCompleted(bankQuery, $.RESTRICTIONS_NOTIFICATION_REQUIRED, _id);
  } else if (property === "restrictionsNotificationStatus") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, bankQuery, $.RESTRICTIONS_NOTIFICATION_RESPONSE);
    }
  } else if (property === "restrictionsNotificationResponse") {
    makeTaskCompleted(bankQuery, $.RESTRICTIONS_NOTIFICATION_RESPONSE, _id);
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, bankQuery, $.RESTRICTIONS_EXIST);
    } else {
      if (propertyValue === NOTIFICATION_STATUS.PENDING) {
        createTaskShortcut(
          res,
          bankQuery,
          $.RESTRICTIONS_NOTIFICATION_MEMORIAL
        );
      }
      cancelTaskBySystem(bankQuery, $.RESTRICTIONS_EXIST);
    }
  } else if (property === "isMemorialCreated" && propertyValue === true) {
    createAssetNotification(
      res,
      bankQuery,
      ASSET_TYPE.BANK,
      NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL,
      null,
      bankAddress
    );
    makeTaskCompleted(bankQuery, $.RESTRICTIONS_NOTIFICATION_MEMORIAL, _id);
  } else if (property === "memorialStatus") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(
        res,
        bankQuery,
        $.RESTRICTIONS_NOTIFICATION_MEMORIAL_RESPONSE
      );
    }
  } else if (property === "memorialResponse") {
    makeTaskCompleted(
      bankQuery,
      $.RESTRICTIONS_NOTIFICATION_MEMORIAL_RESPONSE,
      _id
    );
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, bankQuery, $.RESTRICTIONS_EXIST);
    } else {
      if (propertyValue === NOTIFICATION_STATUS.PENDING) {
        turnBankToDebtor(req, res, caseId, lawOfficeId, bankQuery.bankName);
      } else if (propertyValue === NOTIFICATION_STATUS.REJECTED) {
        createTaskShortcut(res, bankQuery, $.REASON_FOR_NEGATIVE_REQUIRED);
      }
    }
  } else if (
    property &&
    property.includes("restriction.") &&
    checkRestrictionsStatus(bankQuery, res.locals.lawOffice)
  ) {
    if (bankQuery.restriction.exist === true) {
      checkTaskExistByAssetId(bankQuery._id, $.CLAIM_100_DOCUMENT_CREATE, [
        TASK_STATUS.DONE,
        TASK_STATUS.PENDING,
        TASK_STATUS.FUTURE,
      ]).then((exist) => {
        if (!exist) {
          createTaskShortcut(res, bankQuery, $.CLAIM_100_DOCUMENT_CREATE);
        }
      });
    } else {
      checkTaskExistByAssetId(bankQuery._id, $.MONEY_REQUEST_REQUIRED, [
        TASK_STATUS.DONE,
        TASK_STATUS.PENDING,
        TASK_STATUS.FUTURE,
      ]).then((exist) => {
        if (!exist) {
          createTaskShortcut(res, bankQuery, $.MONEY_REQUEST_REQUIRED);
        }
      });
    }
  } else if (property === "claim100DocumentCreated") {
    makeTaskCompleted(bankQuery, $.CLAIM_100_DOCUMENT_CREATE, _id);
    createTaskShortcut(res, bankQuery, $.CLAIM_100_DOCUMENT_STATUS);
  } else if (property === "isDueRequestCreated") {
    if (propertyValue === true) {
      makeTaskCompleted(bankQuery, $.MONEY_REQUEST_REQUIRED, _id);
      createTaskShortcut(res, bankQuery, $.MONEY_REQUEST_RESPONSE);
    } else if (propertyValue === false) {
      cancelTaskBySystem(bankQuery, TASK_TYPE.MONEY_REQUEST_RESPONSE);
      createTaskShortcut(res, bankQuery, $.MONEY_REQUEST_REQUIRED);
    }
  } else if (property === "dueRequestResponse") {
    makeTaskCompleted(bankQuery, $.MONEY_REQUEST_RESPONSE, _id);
    if (propertyValue === true) {
      createTaskShortcut(res, bankQuery, $.SHARE_AMOUNT);
    } else if (propertyValue === false) {
      cancelTaskBySystem(bankQuery, $.SHARE_AMOUNT);
    }
  } else if (
    property === "shareAmount" &&
    (propertyValue || propertyValue === 0)
  ) {
    makeTaskCompleted(bankQuery, $.SHARE_AMOUNT, _id);
    if (propertyValue) {
      handleCollection(bankQuery);
    }
  }
};

const createTaskShortcut = async (
  res,
  bankQuery,
  type,
  startDate,
  extra = {}
) => {
  createTask(
    res,
    bankQuery,
    {
      assetType: "BANK",
      assetId: bankQuery._id,
      type,
      extra,
    },
    false,
    startDate
  );
};

const makeTaskCompleted = (bankQuery, type, userId) => {
  const conditions = {
    assetType: "BANK",
    assetId: bankQuery._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (bankQuery, type, statusCondition) => {
  const conditions = {
    assetType: "BANK",
    assetId: bankQuery._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

const turnBankToDebtor = (req, res, caseId, lawOfficeId, bankName) => {
  DebtorModel.findOne({ name: bankName, lawOfficeId })
    .then((debtor) => {
      if (!debtor) {
        DebtorModel.create({
          lawOfficeId,
          type: DEBTOR_TYPE.INSTITUTION,
          kind: "BORÇLU/MÜFLİS",
          institutionName: bankName,
          addresses: [
            {
              title: bankName,
              description: bankName,
              city: bankName,
              district: bankName,
              type: "formal",
              withNotification: true,
            },
          ],
          isThirdPerson: true,
          thirdPersonReasons: [THIRD_PERSON_REASONS.BANK],
          isBecameDebtor: true,
        })
          .then((debtor) => {
            CaseModel.updateOne(
              { _id: caseId },
              {
                $push: { debtorIds: debtor._id },
                lastUpdate: new Date(),
              }
            )
              .then(() => {
                require("../helpers/DebtorHelper").handleDebtorTasks(
                  req,
                  res,
                  caseId,
                  debtor,
                  false,
                  null,
                  true
                );
              })
              .catch((e) => {
                //TODO:
              });
          })
          .catch((e) => {
            //TODO:
          });
      }
    })
    .catch((e) => {
      //TODO:
    });
};

const handleCollection = async (bankQuery) => {
  await deleteLastCollection(bankQuery);
  createCollection(bankQuery);
};

const createCollection = (bankQuery) => {
  return CollectionModel.create({
    type: COLLECTION_TYPE.BANK,
    payee: "İCRA DOSYASI",
    caseId: bankQuery.caseId,
    debtorId: bankQuery.debtorId,
    amount: bankQuery.shareAmount,
    receivedMoneyCurrency: "TL",
    date: new Date(),
    assetId: bankQuery._id,
    assetType: "BANK",
  });
};

const deleteLastCollection = (bankQuery) => {
  return CollectionModel.deleteOne({
    type: COLLECTION_TYPE.BANK,
    assetId: bankQuery._id,
    assetType: "BANK",
  }).exec();
};

const cancelAllAssetTasksByBankAccountBalanceThreshold = (assetId) => {
  TaskModel.updateMany(
    {
      status: { $ne: TASK_STATUS.DONE },
      $or: [{ assetId }, { "extra.notificationAssetId": assetId }],
    },
    { status: TASK_STATUS.CANCELLED_BY_BANK_ACCOUNT_BALANCE_THRESHOLD }
  ).exec();
};

module.exports = { createBankTasks };
