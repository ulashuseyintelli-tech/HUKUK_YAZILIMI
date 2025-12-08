const {
  createTask,
  cancelTaskManyBySystem,
  doneTaskMany,
} = require("./TaskHelper");
const {
  TASK_TYPE,
  TASK_STATUS,
  NOTIFICATION_STATUS,
  COURT_TYPE,
  DEBTOR_TYPE,
} = require("../constants");
const TaskModel = require("../models/TaskModel");
const IntelModel = require("../models/IntelModel");
const DebtorModel = require("../models/DebtorModel");

const $ = TASK_TYPE;

const createIntelTasks = (req, res, intel) => {
  const { _id } = res.locals.decoded;
  const { property, innerProperty } = req.params;
  const { propertyValue } = req.body;
  // TaskModel.updateOne({
  //   debtorId: intel.debtorId,
  //   caseId: intel.caseId,
  //   type: $.ENTER_INTEL_INFO,
  //   status: TASK_STATUS.PENDING,
  // }).then((res) => {});
  if (!property && !propertyValue) {
    if (intel.selectedTypes.length === 0) {
      createIfNotExist(res, intel, $.SELECT_INTEL_TYPES);
    }
  }

  if (property === "selectedTypes") {
    makeTaskCompleted(intel, $.SELECT_INTEL_TYPES, _id);
    intel.selectedTypes.map((type) => {
      createIfNotExist(res, intel, $.REQUEST_INTEL, null, null, {
        intelType: type,
      });
    });
  } else {
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    if (innerProperty === "isRequested" && intel[property][innerProperty]) {
      makeTaskCompleted(intel, $.REQUEST_INTEL, _id, { intelType: property });
      createIfNotExist(
        res,
        intel,
        $.ENTER_INTEL_RESPONSE,
        null,
        threeDaysLater,
        { intelType: property }
      );
    } else if (innerProperty === "isResponsed") {
      makeTaskCompleted(intel, $.ENTER_INTEL_RESPONSE, _id, {
        intelType: property,
      });
      if (intel[property][innerProperty] === false) {
        createIfNotExist(res, intel, $.REQUEST_INTEL_ALIAS, null, null, {
          intelType: property,
        });
        cancelTaskBySystem(intel, $.IS_INTEL_RESPONSE_USEFUL);
        cancelTaskBySystem(intel, $.UPDATE_DEBTOR_BY_INTEL);
      } else if (intel[property][innerProperty] === true) {
        createIfNotExist(res, intel, $.IS_INTEL_RESPONSE_USEFUL, null, null, {
          intelType: property,
        });
        cancelTaskBySystem(intel, $.ENTER_INTEL_ALIAS_RESPONSE);
        cancelTaskBySystem(intel, $.REQUEST_INTEL_ALIAS);
      }
    } else if (innerProperty === "aliasRequested") {
      makeTaskCompleted(intel, $.REQUEST_INTEL_ALIAS, _id, {
        intelType: property,
      });
      if (intel[property][innerProperty]) {
        createIfNotExist(
          res,
          intel,
          $.ENTER_INTEL_ALIAS_RESPONSE,
          null,
          threeDaysLater,
          { intelType: property }
        );
      }
    } else if (innerProperty === "aliasResponsed") {
      makeTaskCompleted(intel, $.ENTER_INTEL_ALIAS_RESPONSE, _id, {
        intelType: property,
      });
      if (intel[property][innerProperty] === false) {
        createIfNotExist(res, intel, $.CREATE_CHILDREN, null, null, {
          intelType: property,
          cour,
        });
      }
      if (intel[property][innerProperty] === false) {
        createIfNotExist(res, intel, $.CREATE_COURT, null, null, {
          intelType: property,
          courtType: COURT_TYPE.OFFICER_PROCESS,
        });
      } else if (intel[property][innerProperty] === true) {
        createIfNotExist(res, intel, $.IS_INTEL_RESPONSE_USEFUL, null, null, {
          intelType: property,
        });
      }
    } else if (innerProperty === "isResponseUseful") {
      makeTaskCompleted(intel, $.IS_INTEL_RESPONSE_USEFUL, _id, {
        intelType: property,
      });
      if (intel[property][innerProperty] === true) {
        createIfNotExist(res, intel, $.UPDATE_DEBTOR_BY_INTEL, null, null, {
          intelType: property,
        });
      }
    } else if (innerProperty === "response") {
      DebtorModel.findById(intel.debtorId).then((debtor) => {
        const addressCondition =
          intel[property].response.isAddressGiven === false ||
          (intel[property].response.isAddressGiven === true &&
            intel[property].response.addresses &&
            intel[property].response.addresses.length > 0);
        const identityCondition =
          debtor.type === DEBTOR_TYPE.INSTITUTION
            ? intel[property].response.isTaxNumberGiven === false ||
              (intel[property].response.isTaxNumberGiven === true &&
                intel[property].response.taxNumber)
            : intel[property].response.isIdentityNumberGiven === false ||
              (intel[property].response.isIdentityNumberGiven === true &&
                intel[property].response.identityNumber);
        if (addressCondition && identityCondition) {
          makeTaskCompleted(intel, $.UPDATE_DEBTOR_BY_INTEL, _id, {
            intelType: property,
          });
        }
      });
    }
  }
};

const createTaskShortcut = async (res, intel, type, startDate, extra) => {
  createTask(
    res,
    intel,
    {
      assetType: "INTEL",
      assetId: intel._id,
      type,
      status: startDate ? TASK_STATUS.FUTURE : TASK_STATUS.PENDING,
      extra,
    },
    false,
    startDate
  );
};

const createIfNotExist = (res, intel, type, ifExist, startDate, extra) => {
  const conditions = {
    caseId: `${intel.caseId}`,
    debtorId: `${intel.debtorId}`,
    type,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
  };
  if (extra) {
    conditions.extra = extra;
  }
  TaskModel.findOne(conditions)
    .then((task) => {
      if (!task) {
        createTaskShortcut(res, intel, type, startDate, extra);
      } else {
        if (ifExist) {
          ifExist();
        }
      }
    })
    .catch((e) => console.log(e));
};

const makeTaskCompleted = (intel, type, userId, extra) => {
  const conditions = {
    assetType: "INTEL",
    assetId: intel._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (extra) {
    conditions.extra = extra;
  }
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelTaskBySystem = (intel, type, statusCondition) => {
  const conditions = {
    assetType: "INTEL",
    assetId: intel._id,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
  };
  if (statusCondition) {
    conditions.status = statusCondition;
  }
  return cancelTaskManyBySystem(conditions, () => {});
};

module.exports = {
  createIntelTasks,
};
