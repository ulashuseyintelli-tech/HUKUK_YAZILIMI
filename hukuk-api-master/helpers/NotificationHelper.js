const Task = require("../models/TaskModel");
const Debtor = require("../models/DebtorModel");
const {
  NOTIFICATION_TYPE,
  NOTIFICATION_STATUS,
  NOTIFICATION_KIND,
  NOTIFICATION_STATUS_WITH_OBJECTION,
  TASK_STATUS,
  TASK_TYPE,
  COURT_TYPE,
  INPOUNDMENT_TYPES,
  FORECLOSABLE_RECIPIENTS,
  ASSET_TYPE,
} = require("../constants");
const {
  createTask,
  cancelTaskManyBySystem,
  doneTaskMany,
} = require("./TaskHelper");
const {
  checkDebtorEffectiveDate,
  calculateRemainingTimeToEffective,
  calculateRemainingTimeToObjection,
  checkObjectionDate,
  handleEightNotificationCompleteTask,
  handleForeclosableRecipients,
} = require("./CaseHelper");
const TaskModel = require("../models/TaskModel");
const CaseModel = require("../models/CaseModel");
const NotificationModel = require("../models/NotificationModel");
const { createQueryBulk } = require("./QueryHelper");
const DebtorHelper = require("./DebtorHelper");

const { createVehicleTasks } = require("./VehicleHelper");
const { createImmovableTasks } = require("./ImmovableHelper");
const {
  createDeFactoTasks,
  createForeclosableAddressAutomatically,
} = require("./DeFactoHelper");
const { createCustomsDueTasks } = require("./CustomsDueHelper");
const { createSsiTasks } = require("./SsiHelper");
const { createTaxDueTasks } = require("./TaxDueHelper");
const { createCreditorCaseTasks } = require("./CreditorCaseHelper");
const { createPatentTasks } = require("./PatentHelper");
const { createShareTasks } = require("./ShareHelper");
const BankQueryModel = require("../models/BankQueryModel");
const { createBankTasks } = require("./BankQueryHelper");
const { createNormalAssetTasks } = require("./NormalAssetHelper");
const { getAssetModelByType } = require("../lib/assetLib");
const {
  handleRestrictionTableAppraisalStatus,
} = require("./RestrictionHelper");
const ForeclosableAddressModel = require("../models/ForeclosableAddressModel");
const VehicleModel = require("../models/VehicleModel");
const NormalAssetModel = require("../models/NormalAssetModel");

const $ = TASK_TYPE;

const handleNotificationTasks = (req, res, notification) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;
  Debtor.findOne({ _id: notification.debtorId })
    .then(async (debtor) => {
      if (!property && !propertyValue) {
        handleCreationTasks(res, notification);
      } else if (property === "barcodeNumber" && propertyValue !== "") {
        handleBarcodeNumberChange(res, notification);
      } else if (property === "status") {
        handleStatusChange(req, res, notification);
      } else if (property === "objectionDate" && propertyValue) {
        makeTaskCompleted(notification, $.NOTIFICATION_OBJECTION_DATE, _id);
      } else if (property === "doneDate" || property === "recipient") {
        if (property === "doneDate" && notification.doneDate) {
          makeTaskCompleted(notification, $.NOTIFICATION_DONE_DATE);
        }
        if (property === "recipient" && notification.recipient) {
          makeTaskCompleted(notification, $.NOTIFICATION_RECIPIENT);
        }
        if (notification.doneDate && notification.recipient) {
          handleDoneDateChange(req, res, notification);
        }
      }
    })
    .catch((e) => console.log(e));
};

const handleBarcodeNumberChange = (res, notification) => {
  const { _id } = res.locals.decoded;
  makeTaskCompleted(notification, $.NOTIFICATION_BARCODE_NUMBER_REQUIRED, _id);
  createIfTaskDoesNotExist(
    notification,
    $.NOTIFICATION_BARCODE_NUMBER_REQUEST,
    res
  );
};

const handleStatusChange = (req, res, notification) => {
  const { _id } = res.locals.decoded;
  const { propertyValue } = req.body;
  makeTaskCompleted(notification, $.NOTIFICATION_BARCODE_NUMBER_REQUEST, _id);
  makeTaskCompleted(
    notification,
    $[`NOTIFICATION_STEP_${notification.level}`],
    _id
  );
  if (
    notification.type !== NOTIFICATION_TYPE.CASE_INITIALIZATION &&
    (propertyValue !== NOTIFICATION_STATUS.DONE ||
      (notification.type === NOTIFICATION_TYPE.CADASTRE &&
        notification.type === NOTIFICATION_TYPE.ZONING_STATUS &&
        notification.type === NOTIFICATION_TYPE.CHAMBER_OF_COMMERCE))
  ) {
    handleAssetNotificationStatus(
      res,
      notification,
      getPropertyNameByNotificationType(notification)
    );
  }
  if (propertyValue !== NOTIFICATION_STATUS.REJECTED) {
    cancelTaskBySystem(
      notification,
      $[`NOTIFICATION_STEP_${notification.level + 1}`]
    );
  }
  if (propertyValue === NOTIFICATION_STATUS.DONE) {
    createTaskShortcut(res, notification, $.NOTIFICATION_DONE_DATE);
    createTaskShortcut(res, notification, $.NOTIFICATION_RECIPIENT);
  } else {
    cancelTaskBySystem(notification, $.NOTIFICATION_DONE);
    cancelTaskBySystem(notification, $.NOTIFICATION_DONE_DATE);
    if (propertyValue !== NOTIFICATION_STATUS_WITH_OBJECTION.OBJECTION) {
      cancelTaskBySystem(notification, $.NOTIFICATION_OBJECTION);
      cancelTaskBySystem(notification, $.NOTIFICATION_OBJECTION_DATE);
    }
    if (propertyValue === NOTIFICATION_STATUS.PENDING) {
      handleStatusChangeToPending(res, notification);
    } else if (propertyValue === NOTIFICATION_STATUS_WITH_OBJECTION.OBJECTION) {
      handleStatusChangeToObjection(res, notification);
    } else if (propertyValue === NOTIFICATION_STATUS.REJECTED) {
      handleStatusChangeToRejected(res, notification);
    }
  }
};

const getPropertyNameByNotificationType = (notification) => {
  const { type } = notification;
  if (type === NOTIFICATION_TYPE[103]) return "claim103Status";
  else if (type === NOTIFICATION_TYPE.CADASTRE)
    return "cadastreNotificationStatus";
  else if (type === NOTIFICATION_TYPE.ZONING_STATUS)
    return "zoningStatusNotificationStatus";
  else if (type === NOTIFICATION_TYPE.THIRD_PERSON) {
    return "restrictionsNotificationStatus";
  } else if (
    type === NOTIFICATION_TYPE.GARNISHMENT ||
    type === NOTIFICATION_TYPE.SHARE
  ) {
    return "inpoundmentNotificationStatus";
  } else if (type === NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL) {
    return "memorialStatus";
  } else if (type === NOTIFICATION_TYPE.CHAMBER_OF_COMMERCE) {
    return "chamberOfCommerceNotificationStatus";
  }
};

const handleStatusChangeToPending = (res, notification) => {
  const startDate = new Date().setDate(new Date().getDate() + 3);
  createIfTaskDoesNotExist(
    notification,
    $.NOTIFICATION_BARCODE_NUMBER_REQUEST,
    res,
    startDate
  );
};

const handleStatusChangeToObjection = (res, notification) => {
  createIfTaskDoesNotExist(notification, $.CREATE_COURT, res, null, {
    courtType: COURT_TYPE.CASE_INITIALIZATION,
  });
  createTaskShortcut(res, notification, $.NOTIFICATION_OBJECTION_DATE);
};

const handleStatusChangeToRejected = (res, notification) => {
  if (notification.level !== 3) {
    const { debtorId } = notification;
    Debtor.findById(debtorId).then((debtor) => {
      if (debtor) {
        const formalAddresses = DebtorHelper.findFormalAddresses(debtor);
        if (
          formalAddresses.length > 0 ||
          notification.type !== NOTIFICATION_TYPE.CASE_INITIALIZATION
        ) {
          const taskType = $[`NOTIFICATION_STEP_${notification.level + 1}`];
          createTaskShortcut(res, notification, taskType);
        } else {
          TaskModel.findOne({
            debtorId: notification.debtorId,
            caseId: notification.caseId,
            type: $.DEBTOR_NULL_FORMAL_ADDRESS,
          })
            .then((task) => {
              if (!task) {
                createTaskShortcut(
                  res,
                  notification,
                  $.DEBTOR_NULL_FORMAL_ADDRESS
                );
              }
            })
            .catch((e) => console.log(e));
        }
      } else {
        //TODO: Sıkıntılı bir durum
      }
    });
  }
};

const handleDoneDateChange = (req, res, notification) => {
  if (
    notification.type !== NOTIFICATION_TYPE.CASE_INITIALIZATION &&
    notification.type !== NOTIFICATION_TYPE.CADASTRE &&
    notification.type !== NOTIFICATION_TYPE.CHAMBER_OF_COMMERCE &&
    notification.type !== NOTIFICATION_TYPE.ZONING_STATUS
  ) {
    handleDoneDateChangeWithRemainingTime(res, notification);
  } else if (notification.type === NOTIFICATION_TYPE.CASE_INITIALIZATION) {
    handleCaseInitialiationDoneDateChange(req, res, notification);
  }
};

const handleDoneDateChangeWithRemainingTime = (res, notification, days = 7) => {
  const objectionCheck = checkObjectionDate(notification, days);
  if (objectionCheck) {
    if (notification.type !== NOTIFICATION_TYPE.APPRAISAL_RESULT) {
      handleAssetNotificationStatus(
        res,
        notification,
        getPropertyNameByNotificationType(notification)
      );
    } else {
      handleAppraisalNotificationDoneDateChange(res, notification);
    }
    cancelTaskBySystem(notification, $.NOTIFICATION_OBJECTION_REMAINING_TIME);
  } else {
    const remainingTime = calculateRemainingTimeToObjection(notification, days);
    createTaskShortcut(
      res,
      notification,
      $.NOTIFICATION_OBJECTION_REMAINING_TIME,
      remainingTime
    );
  }
};

const handleAppraisalNotificationDoneDateChange = (res, notification) => {
  getAssetModelByType(notification.assetType)
    .findById(notification.assetId)
    .then((asset) => {
      handleRestrictionTableAppraisalStatus(res, asset, notification.assetType);
    })
    .catch((e) => console.log(e));
};

const handleCaseInitialiationDoneDateChange = (req, res, notification) => {
  Task.findOne({
    assetType: "NOTIFICATION",
    assetId: notification._id,
    type: $.NOTIFICATION_DONE,
  })
    .then(async (task) => {
      if (task)
        await Task.deleteOne({ _id: task._id }).catch((e) => console.log(e));
      CaseModel.findById(notification.caseId).then(async (currentCase) => {
        const isDebtorEffective = await checkDebtorEffectiveDate(notification);
        if (currentCase) {
          if (currentCase.type === "8") {
            handleEightNotificationCompleteTask(
              res,
              currentCase,
              isDebtorEffective,
              notification
            );
          } else {
            if (isDebtorEffective) {
              createTaskShortcut(
                res,
                notification,
                getDoneStateTaskTypeByCaseType(currentCase.type)
              );
              handleForeclosableRecipients(res, currentCase, notification);
            } else {
              handleRemainingTimeToBeEffective(res, notification, currentCase);
            }
          }
        } else {
          //TODO: Büyük sıkıntı
        }
      });
    })
    .catch((e) => console.log(e));
};

const getDoneStateTaskTypeByCaseType = (caseType) => {
  if (caseType === "3") return $.CREATE_CHILDREN_DAYS;
  else if (caseType === "11" || caseType === "12") return $.REQUEST_BANKRUPTCY;
  else if (caseType === "14") return $.IS_EVACUATED;
  else return $.NOTIFICATION_DONE;
};

const handleRemainingTimeToBeEffective = async (
  res,
  notification,
  currentCase
) => {
  const remainingTime = await calculateRemainingTimeToEffective(notification);
  createTaskShortcut(
    res,
    notification,
    getDoneStateTaskTypeByCaseType(currentCase.type),
    remainingTime
  );
};

const handleAssetNotificationStatus = (res, notification, field) => {
  const Model = require("../lib/assetLib").getAssetModelByType(
    notification.assetType
  );
  Model.findByIdAndUpdate(
    notification.assetId,
    { [`${field}`]: notification.status },
    { new: true }
  )
    .then((doc) => {
      getAssetTaskHandler(notification.assetType)(
        {
          params: { property: `${field}` },
          body: { propertyValue: notification.status },
        },
        res,
        doc
      );
    })
    .catch((e) => console.log(e));
};

const handleCreationTasks = (res, notification) => {
  const userId = res.locals.decoded._id;
  createTaskShortcut(res, notification, $.NOTIFICATION_BARCODE_NUMBER_REQUIRED);
  let taskType = $[`NOTIFICATION_STEP_${notification.level}`];
  makeTaskCompleted(notification, taskType, userId, true);
};

const createTaskShortcut = async (
  res,
  notification,
  type,
  startDate,
  extra = {}
) => {
  createTask(
    res,
    notification,
    {
      assetType: "NOTIFICATION",
      assetId: notification._id,
      type,
      status: startDate ? TASK_STATUS.FUTURE : TASK_STATUS.PENDING,
      extra: {
        notificationAssetType: notification.assetType,
        notificationAssetId: notification.assetId,
        notificationType: notification.type,
        notificationLevel: notification.level,
        ...extra,
      },
    },
    false,
    startDate
  );
};

const makeTaskCompleted = (notification, type, userId, isCreationTask) => {
  let conditions = {
    assetType: "NOTIFICATION",
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (isCreationTask) {
    conditions = {
      ...conditions,
      "extra.notificationAssetType": notification.assetType,
      "extra.notificationAssetId": notification.assetId,
      "extra.notificationType": notification.type,
    };
  } else {
    conditions.assetId = notification._id;
  }
  return doneTaskMany(conditions, (res) => {}, userId);
};

const cancelTaskBySystem = (notification, type, statusCondition) => {
  const conditions = {
    assetType: "NOTIFICATION",
    assetId: notification._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

const createIfTaskDoesNotExist = (
  notification,
  type,
  res,
  startDate,
  extra = {}
) => {
  Task.findOne({
    assetId: notification._id,
    assetType: "NOTIFICATION",
    type,
    status: startDate ? TASK_STATUS.FUTURE : TASK_STATUS.PENDING,
  })
    .then((task) => {
      if (!task) {
        createTaskShortcut(res, notification, type, startDate, extra);
      }
    })
    .catch((e) => {
      console.log(e);
      //TODO: Kayıt tutulmalı oluşmadığına dahil
    });
};

const getNotificationExpanditure = (notification) => {
  if (notification.kind === NOTIFICATION_KIND.FAST) {
    return 38;
  } else if (notification.kind === NOTIFICATION_KIND.ONLINE) {
    return 4.5;
  } else {
    return 19;
  }
};

const watchTaskChanges = (socket) => {
  NotificationModel.watch().on("change", async (data) => {
    if (data.operationType === "insert") {
      if (!data.fullDocument) {
        await NotificationModel.findById(data.documentKey._id)
          .then((notificaton) => {
            data.fullDocument = notificaton;
          })
          .catch((e) => console.log(e));
        //TODO: Handle edilmeli
      }
      if (
        data.fullDocument &&
        data.fullDocument.assetType &&
        data.fullDocument.assetId
      ) {
        socket.emit(
          `${data.fullDocument.debtorId} ${data.fullDocument.caseId} assets notification`
        );
      }
    }
  });
};

const getAssetTaskHandler = (assetType) => {
  if (assetType === "VEHICLE" || assetType === INPOUNDMENT_TYPES.VEHICLE) {
    return createVehicleTasks;
  } else if (
    assetType === "IMMOVABLE" ||
    assetType === INPOUNDMENT_TYPES.IMMOVABLE
  ) {
    return createImmovableTasks;
  } else if (assetType === "SHARE" || assetType === INPOUNDMENT_TYPES.SHARE) {
    return createShareTasks;
  } else if (
    assetType === "DE_FACTO" ||
    assetType === INPOUNDMENT_TYPES.DE_FACTO
  ) {
    return createDeFactoTasks;
  } else if (
    assetType === "CUSTOMS" ||
    assetType === INPOUNDMENT_TYPES.CUSTOMS
  ) {
    return createCustomsDueTasks;
  } else if (
    assetType === "FAMILY_REGISTER" ||
    assetType === INPOUNDMENT_TYPES.FAMILY_REGISTER
  ) {
    return FamilyMemberModel;
  } else if (assetType === "SSI" || assetType === INPOUNDMENT_TYPES.SSI) {
    return createSsiTasks;
  } else if (
    assetType === "TAX_DUE" ||
    assetType === INPOUNDMENT_TYPES.TAX_DUE
  ) {
    return createTaxDueTasks;
  } else if (assetType === "PATENT" || assetType === INPOUNDMENT_TYPES.PATENT) {
    return createPatentTasks;
  } else if (
    assetType === "CREDITOR_CASE" ||
    assetType === INPOUNDMENT_TYPES.CREDITOR_CASE
  ) {
    return createCreditorCaseTasks;
  } else if (assetType === "BANK" || assetType === INPOUNDMENT_TYPES.BANK) {
    return createBankTasks;
  } else if (assetType === "NORMAL_ASSET") {
    return createNormalAssetTasks;
  }
};

module.exports = {
  handleNotificationTasks,
  getNotificationExpanditure,
  watch: watchTaskChanges,
};
