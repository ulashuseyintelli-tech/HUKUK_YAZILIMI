const {
  TASK_STATUS,
  TASK_TYPE,
  DEBTOR_TYPE,
  ADDRESS_TYPE,
  NOTIFICATION_TYPE,
  NOTIFICATION_STATUS,
} = require("../constants");
const NotificationModel = require("../models/NotificationModel");
const TaskModel = require("../models/TaskModel");
const { doneTaskMany, createTask } = require("./TaskHelper");

const mongoose = require("mongoose");
const DebtorModel = require("../models/DebtorModel");
const CaseModel = require("../models/CaseModel");
const { createQueryBulk } = require("./QueryHelper");
const ForeclosableAddressModel = require("../models/ForeclosableAddressModel");
const { createForeclosableAddressAutomatically } = require("./DeFactoHelper");

const $ = TASK_TYPE;

const handleDebtorTasks = async (
  req,
  res,
  caseId,
  debtor,
  isAddedAgain,
  guarantee,
  shouldSkipNotification
) => {
  const firstLevelObject = {
    caseId,
    debtorId: debtor._id,
  };

  if (isAddedAgain) {
    await TaskModel.findOne({
      ...firstLevelObject,
      status: TASK_STATUS.CANCELLED_BY_CASE_REMOVE,
    })
      .then(async (task) => {
        if (task) {
          return await TaskModel.updateMany(
            {
              ...firstLevelObject,
              status: TASK_STATUS.CANCELLED_BY_CASE_REMOVE,
            },
            { status: TASK_STATUS.PENDING }
          )
            .exec()
            .catch((e) => console.log(e));
        }
      })
      .catch((e) => console.log(e));
  }

  if (guarantee && !guarantee.isFeePaid) {
    await createIfNotExist(res, firstLevelObject, $.GUARANTEE_FEE_MUST_PAY);
  }

  if (shouldSkipNotification) {
    if (
      debtor.type === DEBTOR_TYPE.INSTITUTION &&
      debtor.addresses.length > 0
    ) {
      await ForeclosableAddressModel.exists({ caseId: doc._id, debtorId }).then(
        async (exists) => {
          if (!exists) {
            await createForeclosableAddressAutomatically(
              caseId,
              debtorId,
              debtor.addresses[0]
            ).catch((e) => console.log(e));
          }
        }
      );
    }
    createQueryBulk(res, caseId, debtor._id);
  } else {
    const { _id } = res.locals.decoded;

    const nullIdentity =
      (debtor.type === DEBTOR_TYPE.PERSON && debtor.identityNumber === "") ||
      (debtor.type === DEBTOR_TYPE.INSTITUTION && debtor.taxNumber === "");

    if (debtor.isInformationsAskedAgain) {
      if (debtor.addresses.length === 0) {
        createIfNotExist(res, firstLevelObject, $.ENTER_INTEL_INFO);
      } else if (nullIdentity) {
        createIfNotExist(res, firstLevelObject, $.SELECT_INTEL_TYPES, null, {
          status: TASK_STATUS.DONE,
        });
      }
    }

    if (debtor.addresses.length > 0) {
      makeTaskCompleted(firstLevelObject, $.DEBTOR_NULL_ADDRESS, _id);
      const formalAddresses = findFormalAddresses(debtor);
      if (formalAddresses.length > 0) {
        makeTaskCompleted(firstLevelObject, $.DEBTOR_NULL_FORMAL_ADDRESS, _id);
      } else {
        createIfNotExist(res, firstLevelObject, $.DEBTOR_NULL_FORMAL_ADDRESS);
      }
      NotificationModel.findOne({
        caseId,
        debtorId: debtor._id,
        type: NOTIFICATION_TYPE.CASE_INITIALIZATION,
      })
        .then((notification) => {
          const taskData = {
            assetType: "NOTIFICATION",
            extra: {
              notificationType: NOTIFICATION_TYPE.CASE_INITIALIZATION,
              notificationLevel: formalAddresses.length === 0 ? 1 : 2,
            },
          };
          if (!notification) {
            createIfNotExist(
              res,
              firstLevelObject,
              formalAddresses.length === 0
                ? $.NOTIFICATION_STEP_1
                : $.NOTIFICATION_STEP_2,
              null,
              null,
              taskData
            );
          } else if (
            formalAddresses.length > 0 &&
            notification.status === NOTIFICATION_STATUS.REJECTED
          ) {
            createIfNotExist(
              res,
              firstLevelObject,
              $.NOTIFICATION_STEP_2,
              null,
              null,
              taskData
            );
          }
        })
        .catch((e) => console.log(e));
    } else {
      createIfNotExist(res, firstLevelObject, $.DEBTOR_NULL_ADDRESS);
    }

    if (nullIdentity) {
      createIfNotExist(res, firstLevelObject, $.DEBTOR_NULL_IDENTITY);
    } else {
      makeTaskCompleted(firstLevelObject, $.DEBTOR_NULL_IDENTITY, _id);
    }

    if (
      debtor.addresses.length > 0 &&
      findFormalAddresses(debtor).length > 0 &&
      !nullIdentity
    ) {
      TaskModel.updateMany(
        {
          debtorId: debtor._id,
          caseId,
          $or: [
            { type: $.ENTER_INTEL_INFO },
            { type: $.SELECT_INTEL_TYPES },
            { type: $.REQUEST_INTEL },
            { type: $.ENTER_INTEL_RESPONSE },
            { type: $.REQUEST_INTEL_ALIAS },
            { type: $.ENTER_INTEL_ALIAS_RESPONSE },
            { type: $.UPDATE_DEBTOR_BY_INTEL },
          ],
        },
        { status: TASK_STATUS.DONE }
      ).catch((e) => console.log(e));
    }
  }
};

const createIfNotExist = async (
  res,
  firstLevelObject,
  type,
  ifExist,
  extraStatusCondition,
  data
) => {
  const statusCondition = [
    { status: TASK_STATUS.PENDING },
    { status: TASK_STATUS.FUTURE },
  ];
  if (extraStatusCondition) {
    statusCondition.push(extraStatusCondition);
  }
  return await TaskModel.findOne({
    caseId: `${firstLevelObject.caseId}`,
    debtorId: `${firstLevelObject.debtorId}`,
    type,
    $or: statusCondition,
  }).then((task) => {
    if (!task) {
      createTaskShortcut(res, firstLevelObject, type, data);
    } else {
      if (ifExist) {
        ifExist();
      }
    }
  });
};

const createTaskShortcut = async (res, firstLeveLObject, type, data = {}) => {
  createTask(res, firstLeveLObject, {
    type,
    ...data,
  }).then((createdTask) => {});
};

const makeTaskCompleted = (firstLeveLObject, type, userId) => {
  const conditions = {
    debtorId: firstLeveLObject.debtorId,
    caseId: firstLeveLObject.caseId,
    status: TASK_STATUS.PENDING,
    type,
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const cancelAllTasksByCase = (firstLevelObject) => {
  TaskModel.updateMany(
    {
      debtorId: firstLevelObject.debtorId,
      caseId: firstLevelObject.caseId,
      $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    },
    { status: TASK_STATUS.CANCELLED_BY_CASE_REMOVE }
  )
    .then(() => {})
    .catch(() => {});
};

const findFormalAddresses = (debtor) => {
  return debtor.addresses.filter((a) => a.type === ADDRESS_TYPE.FORMAL.value);
};

const makeThirdPersonDebtor = (
  req,
  res,
  caseId,
  thirdPersonId,
  guarantee,
  shouldSkipNotification
) => {
  DebtorModel.findByIdAndUpdate(
    thirdPersonId,
    {
      isBecameDebtor: true,
      lastUpdate: new Date(),
    },
    { new: true }
  )
    .then((debtor) => {
      CaseModel.updateOne(
        { _id: caseId },
        { $push: { debtorIds: thirdPersonId }, lastUpdate: new Date() }
      )
        .then(() => {
          handleDebtorTasks(
            req,
            res,
            caseId,
            debtor,
            false,
            guarantee,
            shouldSkipNotification
          );
        })
        .catch((e) => {
          console.log(e);
          //TODO: Handle
        });
    })
    .catch((e) => {
      console.log(e);
      //TODO: Handle
    });
};

const defaultAggregate = [
  {
    $lookup: {
      from: "notifications",
      localField: "_id",
      foreignField: "debtorId",
      as: "notifications",
    },
  },
  {
    $lookup: {
      from: "inpoundments",
      localField: "_id",
      foreignField: "debtorId",
      as: "inpoundments",
    },
  },
  {
    $lookup: {
      from: "queries",
      localField: "_id",
      foreignField: "debtorId",
      as: "queries",
    },
  },
  {
    $lookup: {
      from: "vehicles",
      localField: "_id",
      foreignField: "debtorId",
      as: "vehicles",
    },
  },
  {
    $lookup: {
      from: "ssis",
      localField: "_id",
      foreignField: "debtorId",
      as: "ssis",
    },
  },
  {
    $lookup: {
      from: "taxdues",
      localField: "_id",
      foreignField: "debtorId",
      as: "taxDues",
    },
  },
  {
    $lookup: {
      from: "bankqueries",
      localField: "_id",
      foreignField: "debtorId",
      as: "bankQueries",
    },
  },
  {
    $lookup: {
      from: "immovables",
      localField: "_id",
      foreignField: "debtorId",
      as: "immovables",
    },
  },
  {
    $lookup: {
      from: "shares",
      localField: "_id",
      foreignField: "debtorId",
      as: "shares",
    },
  },
  {
    $lookup: {
      from: "creditorcases",
      localField: "_id",
      foreignField: "debtorId",
      as: "creditorCases",
    },
  },
  {
    $lookup: {
      from: "customsdues",
      localField: "_id",
      foreignField: "debtorId",
      as: "customsDues",
    },
  },
  {
    $lookup: {
      from: "patents",
      localField: "_id",
      foreignField: "debtorId",
      as: "patents",
    },
  },
  {
    $lookup: {
      from: "foreclosableaddresses",
      let: { debtorId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [{ $eq: ["$debtorId", "$$debtorId"] }],
            },
          },
        },
        {
          $lookup: {
            from: "defactos",
            let: { addressId: `$_id` },
            pipeline: [
              {
                $match: { foreclosableAddressId: `$addressId` },
              },
            ],
            as: "deFactos",
          },
        },
      ],
      as: "foreclosableAddresses",
    },
  },
];

const lookupPipeline = [
  {
    $match: {
      $expr: {
        $and: [
          { $eq: ["$caseId", "$$caseId"] },
          { $eq: ["$debtorId", "$$debtorId"] },
        ],
      },
    },
  },
];

const lookupPipelineQueryId = [
  {
    $match: {
      $expr: {
        $and: [
          { $eq: ["$caseId", "$$caseId"] },
          { $eq: ["$debtorId", "$$debtorId"] },
        ],
      },
      queryId: { $ne: null },
    },
  },
];

const getLookupLet = (caseId) => {
  return {
    caseId: mongoose.Types.ObjectId(caseId),
    debtorId: "$_id",
  };
};

const getDefaltAggregateWithCaseId = (caseId) => {
  return [
    {
      $lookup: {
        from: "notifications",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "notifications",
      },
    },
    {
      $lookup: {
        from: "queries",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "queries",
      },
    },
    {
      $lookup: {
        from: "vehicles",
        let: getLookupLet(caseId),
        pipeline: lookupPipelineQueryId,
        as: "vehicles",
      },
    },
    {
      $lookup: {
        from: "ssis",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "ssis",
      },
    },
    {
      $lookup: {
        from: "taxdues",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "taxDues",
      },
    },
    {
      $lookup: {
        from: "bankqueries",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "bankQueries",
      },
    },
    {
      $lookup: {
        from: "immovables",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "immovables",
      },
    },
    {
      $lookup: {
        from: "shares",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "shares",
      },
    },
    {
      $lookup: {
        from: "creditorcases",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "creditorCases",
      },
    },
    {
      $lookup: {
        from: "customsdues",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "customsDues",
      },
    },
    {
      $lookup: {
        from: "patents",
        let: getLookupLet(caseId),
        pipeline: lookupPipeline,
        as: "patents",
      },
    },
    {
      $lookup: {
        from: "foreclosableaddresses",
        let: getLookupLet(caseId),
        pipeline: [
          ...lookupPipeline,
          {
            $lookup: {
              from: "defactos",
              let: { addressId: `$_id` },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$foreclosableAddressId", `$$addressId`],
                    },
                  },
                },
              ],
              as: "deFactos",
            },
          },
        ],
        as: "foreclosableAddresses",
      },
    },
  ];
};

module.exports = {
  handleDebtorTasks,
  cancelAllTasksByCase,
  findFormalAddresses,
  defaultAggregate,
  getDefaltAggregateWithCaseId,
  makeThirdPersonDebtor,
};
