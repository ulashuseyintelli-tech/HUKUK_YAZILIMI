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
  ASSET_TYPE,
  DEATH_OPTIONS,
  PROXIMITY_OPTIONS,
} = require("../constants");

const $ = TASK_TYPE;

const createFamilyMemberTasks = (req, res, familyMember) => {
  const { _id } = res.locals.decoded;
  const { property } = req.params;
  const { propertyValue } = req.body;

  if (!property && !propertyValue) {
    if (
      familyMember.proximity === PROXIMITY_OPTIONS.FATHER ||
      familyMember.proximity === PROXIMITY_OPTIONS.MOTHER
    ) {
      if (familyMember.death === DEATH_OPTIONS.DEAD && familyMember.deathDate) {
        if (new Date() - new Date(familyMember.deathDate) > 7776000000) {
          createTaskShortcut(
            res,
            familyMember,
            $.FAMILY_MEMBER_ASSET_QUERY_REQUIRED
          );
        } else {
          const remainingTime =
            7776000000 - (new Date() - new Date(familyMember.deathDate));
          let startDate = new Date();
          const remainingDays = Math.round(remainingTime / 86400000);
          startDate.setDate(startDate.getDate() + remainingDays);
          createTaskShortcut(
            res,
            familyMember,
            $.FAMILY_MEMBER_ASSET_QUERY_REQUIRED,
            startDate
          );
        }
      }
    }
  }
};

const createTaskShortcut = async (res, familyMember, type, startDate) => {
  createTask(
    res,
    familyMember,
    {
      assetType: ASSET_TYPE.FAMILY_MEMBER,
      assetId: familyMember._id,
      type,
      status: TASK_STATUS.PENDING,
    },
    false,
    startDate
  );
};

module.exports = { createFamilyMemberTasks };
