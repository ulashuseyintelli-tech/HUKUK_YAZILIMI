const { TASK_STATUS, TASK_TYPE, COURT_TYPE } = require("../constants");
const CourtModel = require("../models/CourtModel");
const { doneTaskMany, createTask } = require("./TaskHelper");

const createCourt = (court) => {
  return CourtModel.create(court);
};

const handleCourtTasks = (req, res, court) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;
  if (!property && !propertyValue) {
    doneTask(court, TASK_TYPE.CREATE_COURT, _id);
    createTaskShortcut(
      res,
      court,
      TASK_TYPE.JURIDICAL_DAY_RESPONSE_REQUIRED,
      court.juridicalDays[0].date
    );
  } else if (property === "juridicalDays") {
    if (propertyValue) {
      if (propertyValue.operation === "remove") {
      } else if (propertyValue.operation === "add") {
        doneTask(court, TASK_TYPE.NEXT_JURIDICAL_DAY_REQUIRED, _id);
        createTaskShortcut(
          res,
          court,
          TASK_TYPE.JURIDICAL_DAY_RESPONSE_REQUIRED,
          propertyValue.data[propertyValue.data.length - 1].date
        );
      } else if (propertyValue.operation === "changeStatus") {
        doneTask(court, TASK_TYPE.JURIDICAL_DAY_RESPONSE_REQUIRED, _id);
        if (propertyValue.data[propertyValue.data.length - 1].status === 3) {
        } else if (
          propertyValue.data[propertyValue.data.length - 1].status === 2
        ) {
        } else if (
          propertyValue.data[propertyValue.data.length - 1].status === 1
        ) {
          createTaskShortcut(res, court, TASK_TYPE.NEXT_JURIDICAL_DAY_REQUIRED);
        }
      }
    }
  }
};

const doneTask = (court, type, userId) => {
  const conditions = {
    debtorId: court.debtorId,
    caseId: court.caseId,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type,
    extra: { courtType: court.type },
  };
  doneTaskMany(conditions, () => {}, userId);
};

const createTaskShortcut = async (res, court, type, startDate, extra = {}) => {
  createTask(res, court, {
    assetType: court.assetType,
    assetId: court.assetId,
    type,
    startDate,
    extra: { courtType: court.type, courtId: court._id, ...extra },
  });
};

const makeTaskCompleted = (court, type, userId) => {
  const conditions = {
    debtorId: firstLeveLObject.debtorId,
    caseId: firstLeveLObject.caseId,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

module.exports = {
  createCourt,
  handleCourtTasks,
};
