const {
  createTask,
  cancelTaskManyBySystem,
  doneTaskMany,
  makeQueryEntryTaskCompleted,
  createTaskIfFutureTaskNotExist,
} = require("./TaskHelper");
const {
  TASK_TYPE,
  TASK_STATUS,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPE,
  ASSET_TYPE,
} = require("../constants");
const { createBeforeSaleTasks } = require("./SaleHelper");
const { getOneMonthLaterWithDay } = require("./Helper");
const { createAssetNotification } = require("../lib/assetLib");
const { makeThirdPersonDebtor } = require("./DebtorHelper");

const $ = TASK_TYPE;

const createSsiTasks = (req, res, ssi) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  createBeforeSaleTasks(
    req,
    res,
    (type) => createTaskShortcut(res, ssi, type),
    (type) => makeTaskCompleted(ssi, type, _id),
    (type) => cancelTaskBySystem(ssi, type),
    ssi,
    ASSET_TYPE.SSI
  );

  // CREATE SSI CASE
  if (!property && !propertyValue) {
    makeQueryEntryTaskCompleted(ssi, _id);
    if (ssi.shouldCreateInpoundment) {
      createTaskShortcut(res, ssi, $.CREATE_INPOUNDMENT);
    } else {
      createTaskShortcut(res, ssi, $.SHOULD_CREATE_SSI_INPOUNDMENT);
    }
  }

  if (property === "shouldCreateInpoundment") {
    makeTaskCompleted(ssi, $.SHOULD_CREATE_SSI_INPOUNDMENT, _id);
    if (propertyValue === true) {
      createTaskShortcut(res, ssi, $.CREATE_INPOUNDMENT);
    } else {
      cancelTaskBySystem(ssi, $.CREATE_INPOUNDMENT);
    }
  } else if (property === "isInpoundmentCreated" && propertyValue === true) {
    createAssetNotification(
      res,
      ssi,
      ASSET_TYPE.SSI,
      NOTIFICATION_TYPE.GARNISHMENT
    );
    makeTaskCompleted(ssi, $.CREATE_INPOUNDMENT, _id);
  } else if (property === "inpoundmentNotificationStatus") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, ssi, $.INPOUNDMENT_RESPONSE);
    }
  } else if (property === "inpoundmentResponse") {
    makeTaskCompleted(ssi, $.INPOUNDMENT_RESPONSE, _id);
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, ssi, $.RESTRICTIONS_EXIST);
    } else {
      if (propertyValue === NOTIFICATION_STATUS.PENDING) {
        createTaskShortcut(res, ssi, $.INPOUNDMENT_MEMORIAL);
      }
    }
  } else if (property === "isMemorialCreated" && propertyValue === true) {
    createAssetNotification(
      res,
      ssi,
      ASSET_TYPE.SSI,
      NOTIFICATION_TYPE.INPOUNDMENT_MEMORIAL
    );
    makeTaskCompleted(ssi, $.INPOUNDMENT_MEMORIAL, _id);
  } else if (property === "memorialStatus") {
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, ssi, $.INPOUNDMENT_MEMORIAL_RESPONSE);
    }
  } else if (property === "memorialResponse") {
    makeTaskCompleted(ssi, $.INPOUNDMENT_MEMORIAL_RESPONSE, _id);
    if (propertyValue === NOTIFICATION_STATUS.DONE) {
      createTaskShortcut(res, ssi, $.RESTRICTIONS_EXIST);
    } else {
      if (propertyValue === NOTIFICATION_STATUS.PENDING) {
        makeThirdPersonDebtor(req, res, ssi.caseId, ssi.companyId, null, true);
      } else if (propertyValue === NOTIFICATION_STATUS.REJECTED) {
        createTaskShortcut(res, ssi, $.REASON_FOR_NEGATIVE_REQUIRED);
      }
      cancelTaskBySystem(ssi, $.RESTRICTIONS_EXIST);
    }
  } else if (property === "restriction.exist") {
    if (ssi.restriction.exist === true) {
      cancelTaskBySystem(ssi, $.SSI_INPOUNDMENT_SALARY_INFO);
    }
    if (ssi.restriction.exist === false) {
      if (!ssi.salaryInfo.date) {
        createTaskShortcut(res, ssi, $.SSI_INPOUNDMENT_SALARY_INFO);
      }
      cancelTaskBySystem(ssi, $.CREATE_COLLECTION);
    }
  } else if (
    property === "restriction.completed" &&
    ssi.restriction.completed
  ) {
    createTaskShortcut(res, ssi, $.CLAIM_100_DOCUMENT_CREATE);
  } else if (
    property === "salaryInfo" &&
    (propertyValue.amount || propertyValue.amountToCollection)
  ) {
    makeTaskCompleted(ssi, $.SSI_INPOUNDMENT_SALARY_INFO, _id);
    if (propertyValue.date) {
      createTaskIfFutureTaskNotExist(ASSET_TYPE.SSI, ssi._id, () => {
        createTaskShortcut(
          res,
          ssi,
          $.CREATE_COLLECTION,
          getOneMonthLaterWithDay(ssi.salaryInfo.date)
        );
      });
    } else {
      makeTaskCompleted(ssi, $.SSI_INPOUNDMENT_SALARY_AMOUNT, _id);
    }
  }
};

const createTaskShortcut = async (res, ssi, type, startDate) => {
  createTask(
    res,
    ssi,
    {
      assetType: ASSET_TYPE.SSI,
      assetId: ssi._id,
      type,
      status: startDate ? TASK_STATUS.FUTURE : TASK_STATUS.PENDING,
    },
    false,
    startDate
  );
};

const makeTaskCompleted = (ssi, type, userId) => {
  const conditions = {
    assetType: ASSET_TYPE.SSI,
    assetId: ssi._id,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (ssi, type, statusCondition) => {
  const conditions = {
    assetType: ASSET_TYPE.SSI,
    assetId: ssi._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

const isMoreThanOneMonth = (dateString) => {
  dateString = new Date(dateString);
  const now = new Date();
  const oneMonthAsMs = 2592000000;
  return now - dateString > oneMonthAsMs;
};

module.exports = { createSsiTasks, isMoreThanOneMonth };
