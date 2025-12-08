const { createTask } = require("./TaskHelper");
const {
  TASK_TYPE,
  TASK_STATUS,

  COURT_TYPE,
} = require("../constants");

const CaseModel = require("../models/CaseModel");
const TaskModel = require("../models/TaskModel");

const $ = TASK_TYPE;

const ninetyDaysInMs = 86400000 * 90;
const threeYearsInMs = 86400000 * 365 * 3;

const createDueTasks = (req, res, due) => {
  CaseModel.findById(due.caseId)
    .then((currentCase) => {
      if (currentCase) {
        if (
          ninetyDaysInMs <
          new Date(currentCase.date) - new Date(due.expiryDate) <
          threeYearsInMs
        ) {
          if (due.causeOfDebt === "ÇEK") {
            createIfTaskDoesNotExist(
              { ...due.toJSON(), debtorId: currentCase.debtorIds[0] },
              $.CREATE_COURT,
              res,
              { courtType: COURT_TYPE.DUD }
            );
          }
        }
      }
    })
    .catch((e) => console.log(e));
};

const createTaskShortcut = async (res, due, type, extra = {}) => {
  await createTask(res, due, {
    assetType: "DUE",
    assetId: due._id,
    type,
    extra,
  });
};

const createIfTaskDoesNotExist = (due, type, res, extra = {}) => {
  TaskModel.findOne({
    assetId: due._id,
    assetType: "DUE",
    type,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
  })
    .then((task) => {
      if (!task) {
        createTaskShortcut(res, due, type, extra);
      }
    })
    .catch((e) => {
      console.log(e);
      //TODO: Kayıt tutulmalı oluşmadığına dahil
    });
};

module.exports = { createDueTasks };
