const {
  createTask,
  doneTaskMany,
  cancelTaskManyBySystem,
  createTaskIfFutureTaskNotExist,
} = require("./TaskHelper");
const ForeclosableAddress = require("../models/ForeclosableAddressModel");
const {
  TASK_TYPE,
  TASK_STATUS,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPE,
  COLLECTION_TYPE,
  ASSET_TYPE,
} = require("../constants");
const Task = require("../models/TaskModel");
const { createBeforeSaleTasks } = require("./SaleHelper");
const { getOneMonthLaterWithDay } = require("./Helper");
const { createAssetNotification } = require("../lib/assetLib");
const { createNormalAssetTasks } = require("./NormalAssetHelper");
const CollectionModel = require("../models/CollectionModel");
const { makeThirdPersonDebtor } = require("./DebtorHelper");

const $ = TASK_TYPE;

const createDeFactoTasks = (req, res, deFacto) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, deFacto, type),
    (type) => makeTaskCompleted(deFacto, type, _id),
    (type) => cancelTaskBySystem(deFacto, type),
    deFacto,
    ASSET_TYPE.DE_FACTO
  );

  if (
    property === "isDebtorExist" ||
    property === "isPoliceHelped" ||
    property === "is103LeftToPlace"
  ) {
    if (
      deFacto.isDebtorExist === true ||
      (deFacto.isPoliceHelped === true && deFacto.is103LeftToPlace !== null)
    ) {
      createIfNotExist(res, deFacto, $.DE_FACTO_IS_MONEY_RECEIVED);
      createIfNotExist(res, deFacto, $.IS_ASSET_RECEIVED);
      createIfNotExist(res, deFacto, $.DE_FACTO_IS_GUARANTEED);
      createIfNotExist(res, deFacto, $.DE_FACTO_IS_COMMITMENT_RECEIVED);
      createIfNotExist(res, deFacto, $.DE_FACTO_CONSENT_TO_GARNISHMENT);
    } else {
      cancelTaskBySystem(deFacto, $.DE_FACTO_IS_MONEY_RECEIVED);
      cancelTaskBySystem(deFacto, $.IS_ASSET_RECEIVED);
      cancelTaskBySystem(deFacto, $.DE_FACTO_IS_GUARANTEED);
      cancelTaskBySystem(deFacto, $.DE_FACTO_IS_COMMITMENT_RECEIVED);
      cancelTaskBySystem(deFacto, $.DE_FACTO_CONSENT_TO_GARNISHMENT);
    }
  }

  if (property === "isDebtorExist") {
    makeTaskCompleted(deFacto, $.DE_FACTO_IS_DEBTOR_EXIST, _id);
    if (propertyValue === false) {
      createTaskShortcut(res, deFacto, $.DE_FACTO_IS_POLICE_HELPED);
    }
  } else if (property === "isPoliceHelped") {
    makeTaskCompleted(deFacto, $.DE_FACTO_IS_POLICE_HELPED, _id);
    if (propertyValue === true) {
      createTaskShortcut(res, deFacto, $.IS_103_LEFT_TO_PLACE);
    } else if (propertyValue === false) {
      cancelTaskBySystem(deFacto, $.IS_103_LEFT_TO_PLACE);
    }
  } else if (property === "is103LeftToPlace") {
    makeTaskCompleted(deFacto, $.IS_103_LEFT_TO_PLACE, _id);
  } else if (property === "isMoneyReceived") {
    if (propertyValue === true) {
      makeTaskCompleted(deFacto, $.DE_FACTO_IS_MONEY_RECEIVED, _id);
      createTaskShortcut(res, deFacto, $.DE_FACTO_RECEIVED_MONEY_AMOUNT);
    } else {
      cancelTaskBySystem(
        deFacto,
        $.DE_FACTO_RECEIVED_MONEY_AMOUNT,
        TASK_STATUS.PENDING
      );
    }
  } else if (property === "receivedMoneyAmount" && propertyValue !== 0) {
    makeTaskCompleted(deFacto, $.DE_FACTO_RECEIVED_MONEY_AMOUNT, _id);
    Task.findOne({
      assetType: "DE_FACTO",
      assetId: deFacto._id,
      type: $.DE_FACTO_PERSON_GOT_MONEY,
      status: TASK_STATUS.PENDING,
    })
      .then((task) => {
        if (!task) {
          createTaskShortcut(res, deFacto, $.DE_FACTO_PERSON_GOT_MONEY);
        }
      })
      .catch((e) => console.log(e));
  } else if (property === "personGotMoney" && propertyValue === false) {
    makeTaskCompleted(deFacto, $.DE_FACTO_PERSON_GOT_MONEY, _id);
    deleteLastCollection(deFacto, COLLECTION_TYPE.DE_FACTO_MONEY);
    createTaskShortcut(res, deFacto, $.DE_FACTO_IS_MONEY_REQUESTED);
  } else if (property === "personGotMoney" && propertyValue === true) {
    makeTaskCompleted(deFacto, $.DE_FACTO_PERSON_GOT_MONEY, _id);
    handleCollection(deFacto, COLLECTION_TYPE.DE_FACTO_MONEY);
  } else if (property === "isMoneyRequested" && propertyValue === true) {
    makeTaskCompleted(deFacto, $.DE_FACTO_IS_MONEY_REQUESTED, _id);
    handleCollection(deFacto, COLLECTION_TYPE.DE_FACTO_MONEY);
  } else if (property === "isAssetReceived") {
    if (propertyValue === true) {
      makeTaskCompleted(deFacto, $.IS_ASSET_RECEIVED, _id);
      createTaskShortcut(res, deFacto, $.RECEIVED_ASSETS);
    } else {
      cancelTaskBySystem(deFacto, $.RECEIVED_ASSETS);
      cancelTaskBySystem(deFacto, $.CLAIM_103_DOCUMENT_CREATE);
    }
  } else if (
    property === "allReceivedAssetsEntered" &&
    propertyValue === true
  ) {
    makeTaskCompleted(deFacto, $.RECEIVED_ASSETS, _id);
    if (deFacto.isDebtorExist || deFacto.is103LeftToPlace) {
      createTaskShortcut(res, deFacto, $.CUSTODIAN_INFO_REQUIRED);
    } else {
      Task.findOne({
        assetType: "DE_FACTO",
        assetId: deFacto._id,
        status: TASK_STATUS.PENDING,
        type: $.CLAIM_103_DOCUMENT_CREATE,
      }).then((task) => {
        if (!task) {
          createTaskShortcut(res, deFacto, $.CLAIM_103_DOCUMENT_CREATE);
        }
      });
    }
  } else if (property === "claim103DocumentCreated") {
    if (propertyValue === true) {
      ForeclosableAddress.findById(deFacto.foreclosableAddressId)
        .then((address) => {
          createAssetNotification(
            res,
            deFacto,
            "DE_FACTO",
            NOTIFICATION_TYPE[103],
            address
          );
        })
        .catch((e) => console.log(e));
      //TODO: Handle edilmeli
      makeTaskCompleted(deFacto, $.CLAIM_103_DOCUMENT_CREATE, _id);
      createTaskShortcut(res, deFacto, $.CLAIM_103_DOCUMENT_STATUS);
    }
  } else if (property === "claim103Status") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      makeTaskCompleted(deFacto, $.CLAIM_103_DOCUMENT_STATUS, _id);
      createTaskShortcut(res, deFacto, $.CUSTODIAN_INFO_REQUIRED);
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
    makeTaskCompleted(deFacto, $.CUSTODIAN_INFO_REQUIRED, _id);
    deFacto.receivedAssets.map((asset) => {
      createNormalAssetTasks(req, res, asset);
    });
  } else if (property === "isGuaranteed" && propertyValue === true) {
    makeTaskCompleted(deFacto, $.DE_FACTO_IS_GUARANTEED, _id);
    createTaskShortcut(res, deFacto, $.DE_FACTO_GUARANTEE_DETAILS);
  } else if (property === "guaranteeId") {
    makeTaskCompleted(deFacto, $.DE_FACTO_GUARANTEE_DETAILS, _id);
  } else if (property === "isCommitmentReceived") {
    makeTaskCompleted(deFacto, $.DE_FACTO_IS_COMMITMENT_RECEIVED, _id);
    if (propertyValue === true) {
      createTaskShortcut(res, deFacto, $.DE_FACTO_COMMITMENT_DETAILS);
    } else if (propertyValue === false) {
      cancelTaskBySystem(deFacto, $.DE_FACTO_COMMITMENT_DETAILS);
    }
  } else if (property === "commitmentId") {
    makeTaskCompleted(deFacto, $.DE_FACTO_COMMITMENT_DETAILS, _id);
  } else if (property === "consentToGarnishment" && propertyValue === true) {
    makeTaskCompleted(deFacto, $.DE_FACTO_CONSENT_TO_GARNISHMENT, _id);
    createTaskShortcut(res, deFacto, $.DE_FACTO_PERSON_CONSENT_TO_GARNISHMENT);
  } else if (
    property === "personConsentGarnishment" ||
    property === "thirdPersonConsentGarnishmentId"
  ) {
    if (
      deFacto.personConsentGarnishment === 0 ||
      (deFacto.personConsentGarnishment === 1 &&
        deFacto.thirdPersonConsentGarnishmentId)
    ) {
      makeTaskCompleted(deFacto, $.DE_FACTO_PERSON_CONSENT_TO_GARNISHMENT, _id);
      createTaskShortcut(
        res,
        deFacto,
        $.DE_FACTO_COMPANY_OF_PERSON_CONSENT_TO_GARNISHMENT
      );
    }
  } else if (property === "companyId" && propertyValue) {
    makeTaskCompleted(
      deFacto,
      $.DE_FACTO_COMPANY_OF_PERSON_CONSENT_TO_GARNISHMENT,
      _id
    );
    Task.findOne({
      assetType: "DE_FACTO",
      assetId: deFacto._id,
      type: $.DE_FACTO_GARNISHMENT_DOCUMENTS,
      status: TASK_STATUS.PENDING,
    }).then((task) => {
      if (!task) {
        createTaskShortcut(res, deFacto, $.DE_FACTO_GARNISHMENT_DOCUMENTS);
      }
    });
  } else if (property === "isInpoundmentCreated") {
    if (propertyValue === true) {
      makeTaskCompleted(deFacto, $.DE_FACTO_GARNISHMENT_DOCUMENTS, _id);
      ForeclosableAddress.findById(deFacto.foreclosableAddressId)
        .then((address) => {
          createAssetNotification(
            res,
            deFacto,
            "DE_FACTO",
            NOTIFICATION_TYPE.GARNISHMENT,
            address
          );
        })
        .catch((e) => console.log(e));
      //TODO: Handle edilmeli
    }
  } else if (property === "inpoundmentNotificationStatus") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(
        res,
        deFacto,
        $.DE_FACTO_GARNISHMENT_DOCUMENTS_RESPONSE
      );
    }
  } else if (property === "inpoundmentResponse") {
    makeTaskCompleted(deFacto, $.DE_FACTO_GARNISHMENT_DOCUMENTS_RESPONSE, _id);
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, deFacto, $.RESTRICTIONS_EXIST);
    } else {
      if (propertyValue === NOTIFICATION_STATUS.PENDING) {
        createTaskShortcut(res, deFacto, $.INPOUNDMENT_MEMORIAL);
      }
    }
  } else if (property === "isMemorialCreated" && propertyValue === true) {
    createAssetNotification(
      res,
      deFacto,
      ASSET_TYPE.DE_FACTO,
      NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL
    );
    makeTaskCompleted(deFacto, $.INPOUNDMENT_MEMORIAL, _id);
  } else if (property === "memorialStatus") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, deFacto, $.INPOUNDMENT_MEMORIAL_RESPONSE);
    }
  } else if (property === "memorialResponse") {
    makeTaskCompleted(deFacto, $.INPOUNDMENT_MEMORIAL_RESPONSE, _id);
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, deFacto, $.RESTRICTIONS_EXIST);
    } else {
      if (propertyValue === NOTIFICATION_STATUS.PENDING) {
        ForeclosableAddress.findById(deFacto.foreclosableAddressId)
          .then((address) => {
            makeThirdPersonDebtor(
              req,
              res,
              address.caseId,
              deFacto.companyId,
              null,
              true
            );
          })
          .catch((e) => console.log(e));
      } else if (propertyValue === NOTIFICATION_STATUS.REJECTED) {
        createTaskShortcut(res, deFacto, $.REASON_FOR_NEGATIVE_REQUIRED);
      }
      cancelTaskBySystem(deFacto, $.RESTRICTIONS_EXIST);
    }
  } else if (property === "restriction.exist") {
    if (deFacto.restriction.exist === true) {
      cancelTaskBySystem(deFacto, $.DE_FACTO_GARNISHMENT_DETAILS);
    } else if (deFacto.restriction.exist === false) {
      if (!deFacto.garnishmentDetails.date) {
        createTaskShortcut(res, deFacto, $.DE_FACTO_GARNISHMENT_DETAILS);
      }
    }
  } else if (
    property === "restriction.completed" &&
    deFacto.restriction.completed
  ) {
    createTaskShortcut(res, deFacto, $.GARNISHMENT_CLAIM_100_DOCUMENT_CREATE);
  } else if (property === "garnishmentDetails") {
    if (propertyValue.amount || propertyValue.amountToCollection) {
      makeTaskCompleted(deFacto, $.DE_FACTO_GARNISHMENT_DETAILS, _id);
      if (propertyValue.date) {
        Task.findOne({
          assetType: ASSET_TYPE.DE_FACTO,
          assetId: deFacto._id,
          type: $.CREATE_COLLECTION,
          status: TASK_STATUS.FUTURE,
          "extra.innerAssetType": "GARNISHMENT",
        }).then((task) => {
          if (!task) {
            createTaskIfFutureTaskNotExist(
              ASSET_TYPE.DE_FACTO,
              deFacto._id,
              () => {
                createTaskShortcut(
                  res,
                  deFacto,
                  $.CREATE_COLLECTION,
                  getOneMonthLaterWithDay(deFacto.garnishmentDetails.date),
                  { innerAssetType: "GARNISHMENT" }
                );
              }
            );
          }
        });
      } else {
        makeTaskCompleted(deFacto, $.DE_FACTO_GARNISHMENT_SALARY_INFO, _id);
      }
    }
  }
};

const createTaskShortcut = async (
  res,
  deFacto,
  type,
  startDate,
  extra = {}
) => {
  return ForeclosableAddress.findById(deFacto.foreclosableAddressId)
    .then((address) => {
      createTask(
        res,
        address,
        {
          assetType: "DE_FACTO",
          assetId: deFacto._id,
          type,
          status: startDate ? TASK_STATUS.FUTURE : TASK_STATUS.PENDING,
          extra,
        },
        false,
        startDate
      );
    })
    .catch((e) => console.log(e));
};

const createIfNotExist = (res, deFacto, type, startDate) => {
  return ForeclosableAddress.findById(deFacto.foreclosableAddressId)
    .then((address) => {
      const obj = {
        assetType: "DE_FACTO",
        assetId: deFacto._id,
        type,
        status: startDate ? TASK_STATUS.FUTURE : TASK_STATUS.PENDING,
      };
      Task.findOne({
        caseId: address.caseId,
        debtorId: address.debtorId,
        ...obj,
      }).then((task) => {
        if (!task) {
          return createTask(
            res,
            address,
            {
              assetType: "DE_FACTO",
              assetId: deFacto._id,
              type,
              status: startDate ? TASK_STATUS.FUTURE : TASK_STATUS.PENDING,
            },
            false,
            startDate
          );
        } else {
          return null;
        }
      });
    })
    .catch((e) => console.log(e));
};

const makeTaskCompleted = (deFacto, type, userId) => {
  const conditions = {
    assetType: "DE_FACTO",
    assetId: deFacto._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (deFacto, type, statusCondition) => {
  const conditions = {
    assetType: "DE_FACTO",
    assetId: deFacto._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

const handleCollection = async (deFacto, type) => {
  await deleteLastCollection(deFacto, type);
  await ForeclosableAddress.findById(deFacto.foreclosableAddressId)
    .then((foreclosableAddress) => {
      createCollection(foreclosableAddress, deFacto, type);
    })
    .catch((e) => console.log(e)); //TODO: handle
};

const createCollection = async (foreclosableAddress, deFacto, type) => {
  await CollectionModel.create({
    type,
    payee: "İCRA DOSYASI",
    caseId: foreclosableAddress.caseId,
    debtorId: foreclosableAddress.debtorId,
    amount:
      type === COLLECTION_TYPE.DE_FACTO_MONEY
        ? deFacto.receivedMoneyAmount
        : null,
    receivedMoneyCurrency: "TL",
    date: new Date(),
    assetId: deFacto._id,
    assetType: "DE_FACTO",
  });
};

const deleteLastCollection = async (deFacto, type) => {
  return CollectionModel.deleteOne({
    type,
    assetId: deFacto._id,
    assetType: "DE_FACTO",
  }).exec();
};

const createForeclosableAddressAutomatically = (caseId, debtorId, address) => {
  return ForeclosableAddress.create({ caseId, debtorId, ...address });
};

module.exports = {
  createDeFactoTasks,
  createForeclosableAddressAutomatically,
};
