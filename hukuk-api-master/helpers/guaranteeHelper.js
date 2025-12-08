const { doneTaskMany } = require("./TaskHelper");

const { TASK_TYPE, TASK_STATUS } = require("../constants");

const $ = TASK_TYPE;

const handleGuaranteeTasks = (req, res, guarantee) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  if (guarantee.isFeePaid) {
    makeTaskCompleted(guarantee, $.GUARANTEE_FEE_MUST_PAY, _id);
  }
};

const makeTaskCompleted = (guarantee, type, userId) => {
  const conditions = {
    caseId: guarantee.caseId,
    debtorId: guarantee.thirdPersonId,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

module.exports = { handleGuaranteeTasks };
