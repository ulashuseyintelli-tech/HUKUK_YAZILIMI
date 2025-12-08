const {
  createTask,
  cancelTaskManyBySystem,
  doneTaskMany,
} = require("./TaskHelper");
const {
  TASK_TYPE,
  TASK_STATUS,
  CASE_TRANSITION_DAYS,
  NOTIFICATION_STATUS,
  RENTAL_DETAILS,
  RENTAL_TYPES,
  FORECLOSABLE_RECIPIENTS,
  ASSET_TYPE,
} = require("../constants");
const TaskModel = require("../models/TaskModel");
const CaseModel = require("../models/CaseModel");
const PledgedMovableModel = require("../models/PledgedMovableModel");
const ForeclosableAddressModel = require("../models/ForeclosableAddressModel");
const { createForeclosableAddressAutomatically } = require("./DeFactoHelper");
const NotificationModel = require("../models/NotificationModel");
const { createQueryBulk } = require("./QueryHelper");

const $ = TASK_TYPE;

const createCaseTasks = (req, res, caseObject) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  // CREATE "CASE" CASE
  if (!property && !propertyValue) {
    if (
      caseObject.type === "2" ||
      caseObject.type === "3" ||
      caseObject.type === "4" ||
      caseObject.type === "5" ||
      caseObject.type === "6"
    ) {
      if (
        caseObject.writ.basisNumber !== "" &&
        caseObject.writ.adjudgementNumber !== ""
      ) {
        makeTaskCompleted(caseObject, $.ENTER_WRIT_DETAILS, _id);
      }
    }
  }
  if (property === "childrenDetails") {
    if (
      caseObject.childrenDetails.days.length !== 0 &&
      caseObject.childrenDetails.areChildrenReceived !== true
    ) {
      doneTaskMany(
        { caseId: caseObject._id, type: $.CREATE_CHILDREN_DAYS },
        () => {},
        _id
      );
      TaskModel.findOne({
        assetType: "CASE",
        assetId: caseObject._id,
        type: $.RECEIVE_CHILDREN,
        status: TASK_STATUS.PENDING,
      })
        .then((task) => {
          if (!task) {
            createTaskShortcut(res, caseObject, $.RECEIVE_CHILDREN);
          }
        })
        .catch((e) => console.log(e));
    } else if (caseObject.childrenDetails.areChildrenReceived === true) {
      makeTaskCompleted(caseObject, $.RECEIVE_CHILDREN, _id);
    }
  } else if (property === "eviction") {
    const taskStatusOrState = [
      { status: TASK_STATUS.PENDING },
      { status: TASK_STATUS.FUTURE },
    ];
    if (
      caseObject.eviction.isEvacuatedBySelf === true ||
      caseObject.eviction.isEvacuatedBySelf === false
    ) {
      TaskModel.updateMany(
        {
          caseId: caseObject._id,
          $or: taskStatusOrState,
          type: $.IS_EVACUATED,
        },
        { status: TASK_STATUS.DONE }
      ).exec();
    }
    if (caseObject.eviction.isEvacuatedBySelf === false) {
      if (caseObject.eviction.isEvacuated === null) {
        if (caseObject.eviction.isEvictionRequested === null) {
          TaskModel.exists({
            caseId: caseObject._id,
            $or: taskStatusOrState,
            type: $.REQUEST_EVICTION,
          }).then((exists) => {
            if (!exists) {
              createTaskShortcut(res, caseObject, $.REQUEST_EVICTION);
            }
          });
        } else if (caseObject.eviction.isEvictionRequested === true) {
          TaskModel.updateMany(
            {
              caseId: caseObject._id,
              $or: taskStatusOrState,
              type: $.REQUEST_EVICTION,
            },
            { status: TASK_STATUS.DONE }
          ).exec();
          TaskModel.exists({
            caseId: caseObject._id,
            $or: taskStatusOrState,
            type: $.ENTER_EVICTION_RESPONSE,
          }).then((exists) => {
            if (!exists) {
              createTaskShortcut(res, caseObject, $.ENTER_EVICTION_RESPONSE);
            }
          });
        }
      } else {
        TaskModel.updateMany(
          {
            caseId: caseObject._id,
            $or: taskStatusOrState,
            type: $.ENTER_EVICTION_RESPONSE,
          },
          { status: TASK_STATUS.DONE }
        ).exec();
      }
    }
  } else if (property === "bankruptcyInfo") {
    if (caseObject.bankruptcyInfo.isRequested) {
      TaskModel.updateMany(
        {
          caseId: caseObject._id,
          $or: [
            { status: TASK_STATUS.PENDING },
            { status: TASK_STATUS.FUTURE },
          ],
          type: $.REQUEST_BANKRUPTCY,
        },
        { status: TASK_STATUS.DONE }
      ).exec();
      TaskModel.findOne({
        caseId: caseObject._id,
        $or: [
          { status: TASK_STATUS.PENDING },
          { status: TASK_STATUS.FUTURE },
          { status: TASK_STATUS.DONE },
        ],
        type: $.ENTER_BANKRUPTCY_RESPONSE,
      }).then((task) => {
        if (!task) {
          createTaskShortcut(res, caseObject, $.ENTER_BANKRUPTCY_RESPONSE);
        }
      });
    }
    if (caseObject.bankruptcyInfo.response !== null) {
      TaskModel.updateMany(
        {
          caseId: caseObject._id,
          $or: [
            { status: TASK_STATUS.PENDING },
            { status: TASK_STATUS.FUTURE },
          ],
          type: $.ENTER_BANKRUPTCY_RESPONSE,
        },
        { status: TASK_STATUS.DONE }
      ).exec();
      if (caseObject.bankruptcyInfo.response === true) {
        TaskModel.findOne({
          caseId: caseObject._id,
          $or: [
            { status: TASK_STATUS.PENDING },
            { status: TASK_STATUS.FUTURE },
            { status: TASK_STATUS.DONE },
          ],
          type: $.MAKE_BANKRUPTCY_WRITTEN_TO_ESTATE,
        }).then((task) => {
          if (!task) {
            createTaskShortcut(
              res,
              caseObject,
              $.MAKE_BANKRUPTCY_WRITTEN_TO_ESTATE
            );
          }
        });
      }
    }
    if (caseObject.bankruptcyInfo.isWrittenToEstate !== null) {
      TaskModel.updateMany(
        {
          caseId: caseObject._id,
          $or: [
            { status: TASK_STATUS.PENDING },
            { status: TASK_STATUS.FUTURE },
          ],
          type: $.MAKE_BANKRUPTCY_WRITTEN_TO_ESTATE,
        },
        { status: TASK_STATUS.DONE }
      ).exec();
    }
  }
};

const createTaskShortcut = async (res, caseObject, type, startDate) => {
  createTask(
    res,
    caseObject,
    {
      assetType: "CASE",
      assetId: caseObject._id,
      type,
    },
    true,
    startDate
  );
};

const makeTaskCompleted = (caseObject, type, userId) => {
  const conditions = {
    assetType: "CASE",
    assetId: caseObject._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const findCurrentCaseAndGetTransitionDays = async (firstLevelObject) => {
  let days = 0;
  await CaseModel.findById(firstLevelObject.caseId)
    .then((currentCase) => {
      if (currentCase) {
        if (currentCase.type === "13") {
          if (currentCase.rentalDetails.type === RENTAL_TYPES[0]) {
            if (parseInt(currentCase.rentalDetails.contractDuration) >= 6) {
              days = 30;
            } else {
              days = 6;
            }
          } else {
            days = 60;
          }
        } else {
          days = CASE_TRANSITION_DAYS[currentCase.type];
        }
      }
    })
    .catch((e) => console.log(e));
  return days;
};

// Takibin borçlu için kesinleşip kesinleşmediğini kontrol eder
const checkDebtorEffectiveDate = async (notification) => {
  const transitionDays = await findCurrentCaseAndGetTransitionDays(
    notification
  );
  if (notification.doneDate && transitionDays) {
    const now = new Date();
    const doneDate = new Date(notification.doneDate);
    return (now - doneDate) / 86400000 > transitionDays;
  } else return false;
};

const calculateRemainingTimeToEffective = async (notification) => {
  const transitionDays = await findCurrentCaseAndGetTransitionDays(
    notification
  );
  const now = new Date();
  const doneDate = new Date(notification.doneDate);

  const diff = transitionDays - parseInt((now - doneDate) / 86400000);
  now.setDate(now.getDate() + diff);
  return now;
};

const checkObjectionDate = (notification, days = 7) => {
  if (
    notification.doneDate &&
    notification.status === NOTIFICATION_STATUS.DONE
  ) {
    const now = new Date();
    const doneDate = new Date(notification.doneDate);
    return (now - doneDate) / 86400000 > days;
  } else return false;
};

// 103 itiraz süresinin dolup dolmadığını hesaplar
const check103ObjectionDate = (notification) => {
  if (
    notification.doneDate &&
    notification.status === NOTIFICATION_STATUS.DONE
  ) {
    const now = new Date();
    const doneDate = new Date(notification.doneDate);
    return (now - doneDate) / 86400000 > 7;
  } else return false;
};

const calculateRemainingTimeToObjection = (notification, days = 7) => {
  const now = new Date();
  const doneDate = new Date(notification.doneDate);

  const diff = days - parseInt((now - doneDate) / 86400000);
  now.setDate(now.getDate() + diff);
  return now;
};

const handleEightNotificationCompleteTask = async (
  res,
  currentCase,
  isDebtorEffective,
  notification
) => {
  try {
    const { assetId } = currentCase.hypotecInfo;
    const assetType = ASSET_TYPE.PLEDGED_MOVABLE;
    const asset = await PledgedMovableModel.findById(assetId);
    if (isDebtorEffective) {
      createTask(res, asset, {
        assetType,
        assetId,
        type: $.RESTRICTIONS_EXIST,
      });
      createTask(res, asset, {
        assetType,
        assetId,
        type: $.SALE_ADVANCE_REQUIRED,
      });
    } else {
      const remainingTime = await calculateRemainingTimeToEffective(
        notification
      );
      createTask(
        res,
        asset,
        { assetType, assetId, type: $.RESTRICTIONS_EXIST },
        false,
        remainingTime
      );
      createTask(
        res,
        asset,
        { assetType, assetId, type: $.SALE_ADVANCE_REQUIRED },
        false,
        remainingTime
      );
    }
  } catch (e) {
    console.log(e);
    //TODO: handle this by sentry!
  }
};

const handleForeclosableRecipients = async (res, currentCase, notification) => {
  if (
    currentCase.type === "7" ||
    currentCase.type === "10" ||
    currentCase.type === "13"
  ) {
    await ForeclosableAddressModel.exists({
      caseId: currentCase._id,
      debtorId: notification.debtorId,
    }).then(async (exists) => {
      if (!exists) {
        if (
          notification.level === 1 &&
          FORECLOSABLE_RECIPIENTS.includes(notification.recipient)
        ) {
          await createForeclosableAddressAutomatically(
            notification.caseId,
            notification.debtorId,
            notification.address
          );
        } else {
          await NotificationModel.find({
            caseId: notification.caseId,
            debtorId: notification.debtorId,
          }).then(async (notifications) => {
            if (
              notifications.length === 1 &&
              FORECLOSABLE_RECIPIENTS.includes(notifications[0].recipient)
            ) {
              await createForeclosableAddressAutomatically(
                notification.caseId,
                notification.debtorId,
                notification.address
              );
            }
          });
        }
      }
    });
    createQueryBulk(res, notification.caseId, notification.debtorId);
  }
};

module.exports = {
  createCaseTasks,
  findCurrentCaseAndGetTransitionDays,
  checkDebtorEffectiveDate,
  calculateRemainingTimeToEffective,
  checkObjectionDate,
  check103ObjectionDate,
  calculateRemainingTimeToObjection,
  handleEightNotificationCompleteTask,
  handleForeclosableRecipients,
};
