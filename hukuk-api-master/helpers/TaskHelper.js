const Task = require("../models/TaskModel");
const LawOffice = require("../models/LawOfficeModel");
const constants = require("../constants");
const { TASK_TYPE, TASK_STATUS } = require("../constants");
const TaskLogModel = require("../models/TaskLogModel");
const TaskModel = require("../models/TaskModel");

const $ = TASK_TYPE;
const createTask = async (
  res,
  firstLevelObject,
  data,
  isObjectCase,
  startDate
) => {
  let dueDate = new Date();

  let caseId;
  let debtorId;
  if (isObjectCase) {
    caseId = firstLevelObject._id;
    debtorId = firstLevelObject.debtorIds[0];
  } else {
    caseId = firstLevelObject.caseId;
    debtorId = firstLevelObject.debtorId;
  }
  if (!startDate) {
    startDate = new Date();
  } else {
    dueDate = new Date(startDate);
  }

  const { lawOffice } = res.locals;

  const authorities =
    lawOffice.caseTaskPermissions[lawOffice.caseTaskPermissions.length - 1];
  const transition = lawOffice.taskTransitionDays.find(
    (tran) => tran.value === data.type
  );
  const transitionDays = transition ? transition.days : 3;
  dueDate.setDate(dueDate.getDate() + transitionDays);

  return Task.create({
    lawOfficeId: lawOffice._id,
    userIds: authorities,
    dueDate,
    startDate,
    caseId,
    debtorId,
    ...data,
  });
};

const doneTaskMany = (conditions, cb, userId, extraUpdate) => {
  let updateObject = {
    status: constants.TASK_STATUS.DONE,
    updatedAt: new Date(),
    completedUserId: userId,
  };
  if (extraUpdate) {
    updateObject = { ...updateObject, ...extraUpdate };
  }
  Task.updateMany(conditions, updateObject)
    .then((res) => {
      if (cb) {
        cb(res);
      }
    })
    .catch((e) => console.log(e));
};

const cancelTaskManyBySystem = (conditions, cb) => {
  Task.updateMany(conditions, {
    status: constants.TASK_STATUS.CANCELLED_BY_SYSTEM,
    updatedAt: new Date(),
  })
    .then((res) => {
      if (cb) {
        cb();
      }
    })
    .catch((e) => console.log(e));
};

const createQueryTask = async (res, query) => {
  const { lawOfficeId } = res.locals.decoded;
  const { caseId, debtorId, type, _id } = query;
  Task.updateOne(
    { caseId, debtorId, type: $.NOTIFICATION_DONE },
    { status: TASK_STATUS.DONE }
  ).exec();
  await LawOffice.findById(lawOfficeId).then((lawOffice) => {
    const authorities =
      lawOffice.caseTaskPermissions[lawOffice.caseTaskPermissions.length - 1];
    const transitionDays = lawOffice.taskTransitionDays.find(
      (tran) => tran.value === $.QUERY_RESPONSE_REQUIRED
    ).days;
    if (type !== "BANK") {
      const startDate = new Date();
      const dueDate = new Date();
      dueDate.setDate(startDate.getDate() + transitionDays);
      return Task.create({
        lawOfficeId,
        userIds: authorities,
        caseId,
        debtorId,
        status: TASK_STATUS.FUTURE,
        startDate,
        type: $.QUERY_RESPONSE_REQUIRED,
        extra: { queryType: type, queryId: _id },
        dueDate,
      });
    }
  });
};

const handleQueryUpdationTasks = async (isResultEmpty, query, res) => {
  const { _id, lawOfficeId } = res.locals.decoded;
  const conditions = {
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    type: $.QUERY_RESPONSE_REQUIRED,
    "extra.queryId": query._id,
  };
  doneTaskMany(conditions, null, _id);
  await LawOffice.findById(lawOfficeId).then((lawOffice) => {
    const authorities =
      lawOffice.caseTaskPermissions[lawOffice.caseTaskPermissions.length - 1];
    if (isResultEmpty === false) {
      const transitionDays = lawOffice.taskTransitionDays.find(
        (tran) => tran.value === $.QUERY_RESPONSE_ENTRY_REQUIRED
      ).days;
      const { caseId, debtorId, type } = query;
      Task.findOneAndUpdate(
        {
          caseId,
          debtorId,
          "extra.queryType": type,
          status: TASK_STATUS.FUTURE,
        },
        { status: TASK_STATUS.DONE },
        { new: true }
      )
        .then()
        .catch((e) => console.log(e));
      return Task.create({
        lawOfficeId,
        userIds: authorities,
        caseId,
        debtorId,
        assetType: "QUERY",
        assetId: query._id,
        type: $.QUERY_RESPONSE_ENTRY_REQUIRED,
        extra: { queryType: type, queryId: query._id },
        dueDate: new Date().setDate(new Date().getDate() + transitionDays),
      });
    } else {
      const transitionDays = lawOffice.taskTransitionDays.find(
        (tran) => tran.value === $.AGAIN_QUERY_REQUIRED
      ).days;
      const now = new Date();
      now.setDate(now.getDate() + lawOffice.queryReminderDays[query.type]);
      const { caseId, debtorId, type } = query;
      Task.findOne({
        caseId,
        debtorId,
        assetId: query._id,
        type: $.AGAIN_QUERY_REQUIRED,
      }).then((task) => {
        if (task) {
          Task.deleteOne({ _id: task._id })
            .then(() => {})
            .catch((e) => console.log(e));
        }
      });
      Task.create({
        lawOfficeId,
        caseId,
        debtorId,
        assetType: "QUERY",
        assetId: query._id,
        status: TASK_STATUS.FUTURE,
        startDate: now,
        type: $.AGAIN_QUERY_REQUIRED,
        userIds: authorities,
        debtorId,
        dueDate: new Date().setDate(new Date().getDate() + transitionDays),
        extra: { queryType: type, queryId: query._id },
      })
        .then()
        .catch((e) => console.log(e));

      cancelTaskManyBySystem(
        { ...conditions, type: $.QUERY_RESPONSE_ENTRY_REQUIRED },
        null
      );
    }
  });
};

const makeQueryEntryTaskCompleted = (object, userId) => {
  const conditions = {
    type: $.QUERY_RESPONSE_ENTRY_REQUIRED,
    "extra.queryId": object.queryId,
    $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
  };
  return doneTaskMany(conditions, () => {}, userId);
};

const createForeclosableAddressTask = (
  res,
  address,
  withCompleteTask = true
) => {
  const { _id } = res.locals.decoded;
  if (withCompleteTask) {
    doneTaskMany(
      {
        debtorId: address.debtorId,
        caseId: address.caseId,
        type: $.FORECLOSABLE_ADDRESS_REQUIRED,
        assetType: constants.ASSET_TYPE.DE_FACTO,
      },
      () => {},
      _id
    );
  }
  return createTask(res, address, {
    type: $.SEIZE_DE_FACTO_REQUIRED,
    assetType: constants.ASSET_TYPE.DE_FACTO,
    assetId: address._id,
  });
};

const createTaskIfFutureTaskNotExist = (
  assetType,
  assetId,
  create,
  extraConditions
) => {
  let conditionObject = { assetType, assetId, status: TASK_STATUS.FUTURE };
  if (extraConditions) {
    conditionObject = { ...conditionObject, ...extraConditions };
  }
  return Task.findOne(conditionObject)
    .then((task) => {
      if (!task && create) {
        create();
      }
    })
    .catch();
};

const doneFutureTask = (conditions, cb, userId) => {
  Task.updateMany(
    { ...conditions, status: TASK_STATUS.FUTURE },
    {
      status: constants.TASK_STATUS.DONE,
      updatedAt: new Date(),
      completedUserId: userId,
    }
  )
    .then((res) => {
      if (cb) {
        cb();
      }
    })
    .catch((e) => console.log(e));
};

const defaultLookups = [
  {
    $lookup: {
      from: "users",
      localField: "userIds",
      foreignField: "_id",
      as: "users",
    },
  },
  {
    $lookup: {
      from: "debtors",
      localField: "debtorId",
      foreignField: "_id",
      as: "debtor",
    },
  },
  {
    $lookup: {
      from: "cases",
      localField: "caseId",
      foreignField: "_id",
      as: "currentCase",
    },
  },
];

const defaultLookupsWithExecutionOffice = [
  {
    $lookup: {
      from: "users",
      localField: "userIds",
      foreignField: "_id",
      as: "users",
    },
  },
  {
    $lookup: {
      from: "debtors",
      localField: "debtorId",
      foreignField: "_id",
      as: "debtor",
    },
  },
  {
    $lookup: {
      from: "cases",
      let: { caseId: "$caseId" },
      pipeline: [
        {
          $match: { $expr: { $eq: ["$_id", "$$caseId"] } },
        },
        {
          $lookup: {
            from: "executionoffices",
            let: { officeId: "$executionOfficeId" },
            pipeline: [
              {
                $match: { $expr: { $eq: ["$_id", "$$officeId"] } },
              },
            ],
            as: "executionOffice",
          },
        },
      ],
      as: "currentCase",
    },
  },
];

const watchTaskChanges = (socket) => {
  Task.watch().on("change", async (data) => {
    if (!data.fullDocument) {
      await Task.findById(data.documentKey._id)
        .then((task) => {
          data.fullDocument = task;
        })
        .catch((e) => console.log(e));
      //TODO: Handle edilmeli
    }
    if (data.fullDocument && data.fullDocument.caseId) {
      socket.emit(`${data.fullDocument.caseId} task`);
      if (data.fullDocument.debtorId) {
        socket.emit(
          `${data.fullDocument.debtorId} ${data.fullDocument.caseId} task`
        );
      }
      if (
        data.fullDocument.assetType ||
        (data.fullDocument.extra && data.fullDocument.extra.queryType)
      ) {
        socket.emit(
          `${data.fullDocument.debtorId} ${data.fullDocument.caseId} assets task`
        );
      }
    }
    socket.emit("newTask", { msg: "new task created" });
    Task.aggregate([
      {
        $match: {
          _id: data.documentKey._id,
        },
      },
      ...defaultLookups,
    ]).then((task) => {
      if (task[0]) {
        task = task[0];
        TaskLogModel.create({
          caseId: task.caseId,
          lawOfficeId: task.lawOfficeId,
          taskId: task._id,
          clusterTime: data.clusterTime,
          operationType: data.operationType,
          updateDescription: data.updateDescription,
        }).then((taskLog) => {
          if (
            (data.updateDescription && data.updateDescription.updatedFields) ||
            data.operationType === "insert"
          ) {
            TaskLogModel.aggregate([
              {
                $match: { lawOfficeId: task.lawOfficeId, _id: taskLog._id },
              },
              {
                $lookup: {
                  from: "tasks",
                  let: { taskId: "$taskId" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $eq: [`$_id`, `$$taskId`],
                        },
                      },
                    },
                    ...defaultLookups,
                  ],
                  as: "task",
                },
              },
              {
                $limit: 1,
              },
            ])
              .then((logs) => {
                socket.emit(`${task.lawOfficeId} task`, logs);
              })
              .catch((e) => console.log(e));
          }
        });
      }
    });
  });
};

const checkTaskExistByAssetId = (
  assetId,
  type,
  status = NOTIFICATION_STATUS.PENDING
) => {
  if (Array.isArray(status)) {
    return TaskModel.exists({
      assetId,
      type,
      $or: status.map((stat) => {
        return { status: stat };
      }),
    });
  }
  return TaskModel.exists({ assetId, type, status });
};

module.exports = {
  createTask,
  doneTaskMany,
  cancelTaskManyBySystem,
  createQueryTask,
  handleQueryUpdationTasks,
  createForeclosableAddressTask,
  makeQueryEntryTaskCompleted,
  createTaskIfFutureTaskNotExist,
  doneFutureTask,
  watch: watchTaskChanges,
  defaultLookups,
  defaultLookupsWithExecutionOffice,
  checkTaskExistByAssetId,
};
