const express = require("express"),
  Task = require("../models/TaskModel"),
  Helper = require("../helpers/Helper"),
  router = express.Router();

const mongoose = require("mongoose");
const { createError, serverError } = require("../helpers/ErrorHelper");
const Middlewares = require("../middlewares/Middlewares");
const LawOffice = require("../models/LawOfficeModel");
const {
  TASK_STATUS,
  TASK_TYPE,
  CASE_INITIALIZATION_TASK_TYPES,
} = require("../constants");
const CaseModel = require("../models/CaseModel");
const constants = require("../constants");
const TaskHelper = require("../helpers/TaskHelper");
const ExecutionOffice = require("../models/ExecutionOffice");
const CustomsDueModel = require("../models/CustomsDueModel");
const NotificationModel = require("../models/NotificationModel");

router.put("/:taskId/cancel", Middlewares.verifyToken, (req, res, next) => {
  const { taskId } = req.params;
  const { _id, lawOfficeId } = res.locals.decoded;
  const { causeOfCancel } = req.body;
  LawOffice.findById(lawOfficeId).then(async (lawOffice) => {
    const { caseTaskPermissions } = lawOffice;
    const weights = {};
    caseTaskPermissions.map((perm, index) => (weights[index] = 0));
    await Task.findById(taskId).then((task) => {
      for (let i = 0; i < task.userIds.length; i++) {
        const taskUserId = task.userIds[i];
        for (let j = 0; j < caseTaskPermissions.length; j++) {
          if (caseTaskPermissions[j].includes(`${taskUserId}`)) {
            weights[j] += 1;
          }
        }
      }
      let indexOfBiggestWeight = 0;
      Object.keys(weights).map((key) => {
        if (weights[key] > weights[indexOfBiggestWeight]) {
          indexOfBiggestWeight = key;
        } else if (
          weights[key] === weights[indexOfBiggestWeight] &&
          parseInt(key) > indexOfBiggestWeight
        ) {
          indexOfBiggestWeight = key;
        }
      });
      indexOfBiggestWeight = parseInt(indexOfBiggestWeight);
      const nextPermissionIndex =
        indexOfBiggestWeight === 0 ? 0 : indexOfBiggestWeight - 1;
      task = task.toObject();
      const canceledLinkedTaskId = task._id;
      delete task._id;
      Task.create({
        ...task,
        lawOfficeId,
        canceledLinkedTaskId,
        step: task.step + 1,
        userIds: lawOffice.caseTaskPermissions[nextPermissionIndex],
      })
        .then(async () => {
          await Task.updateOne(
            { _id: taskId },
            {
              status: TASK_STATUS.CANCELLED,
              canceledUserId: _id,
              causeOfCancel,
            }
          )
            .then(() => {
              res.sendStatus(200);
            })
            .catch((e) => next(serverError(e)));
        })
        .catch((e) => next(serverError(e)));
    });
  });
});

router.put("/:taskId/extend", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = res.locals.decoded;
  const { taskId } = req.params;
  const { extensionDays, cuaseOfExtension } = req.body;
  Task.findById(taskId).then((task) => {
    if (task) {
      const dueDate = new Date(task.dueDate);
      dueDate.setMilliseconds(
        dueDate.getMilliseconds() + extensionDays * 86400000
      );
      Task.updateOne(
        { _id: taskId },
        {
          dueDate,
          $push: {
            extensionHistory: {
              extensionDays,
              cuaseOfExtension,
              userId: _id,
              extendedAt: new Date(),
            },
          },
        }
      )
        .then(() => res.sendStatus(200))
        .catch((e) => next(serverError(e)));
    } else {
      res.sendStatus(404);
    }
  });
});

const lookups = [
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

const lookupsWithClients = [
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
        {
          $lookup: {
            from: "clients",
            let: { clientIds: "$clientIds" },
            pipeline: [
              {
                $match: { $expr: { $in: ["$_id", "$$clientIds"] } },
              },
            ],
            as: "clients",
          },
        },
      ],
      as: "currentCase",
    },
  },
];

router.get("/byOptions", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  const { sortBy, status, debtorId, caseId, type } = req.query;

  const matchObject = {
    lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
  };

  const thisMorning = new Date();
  thisMorning.setUTCHours(0, 0, 0, 0);
  const thisEvening = new Date();
  thisEvening.setUTCHours(23, 59, 59, 59);

  if (status === TASK_STATUS.PENDING) {
    matchObject.startDate = { $lte: thisEvening };
    matchObject.dueDate = { $gte: thisMorning };
    matchObject.$or = [
      { status: TASK_STATUS.PENDING },
      { status: TASK_STATUS.FUTURE },
    ];
  } else if (status === TASK_STATUS.FUTURE) {
    matchObject.startDate = { $gte: thisEvening };
    matchObject.$or = [
      { status: TASK_STATUS.PENDING },
      { status: TASK_STATUS.FUTURE },
    ];
  } else if (status === TASK_STATUS.OVERDUE) {
    matchObject.dueDate = { $lte: thisEvening };
    matchObject.$or = [
      { status: TASK_STATUS.PENDING },
      { status: TASK_STATUS.FUTURE },
    ];
  } else {
    matchObject.status = status;
  }

  if (debtorId) {
    matchObject.debtorId = mongoose.Types.ObjectId(debtorId);
  }

  if (caseId) {
    matchObject.caseId = mongoose.Types.ObjectId(caseId);
  }

  if (type) {
    matchObject.type = type;
  }

  let aggregates = [
    {
      $match: matchObject,
    },
    {
      $sort: constants.TASK_SORT_OPTIONS[sortBy].value,
    },
  ];

  if (!caseId) {
    aggregates.push({
      $group: {
        _id: "$caseId",
        count: { $sum: 1 },
      },
    });
    aggregates.push({
      $lookup: {
        from: "cases",
        foreignField: "_id",
        localField: "_id",
        as: "case",
      },
    });
  } else {
    aggregates = [...aggregates, ...lookups];
    aggregates.push({
      $limit: 1000,
    });
  }

  Task.aggregate(aggregates)
    .then((tasks) => {
      tasks.map((task) => {});
      res.send(tasks);
    })
    .catch((e) => next(serverError(e)));
});

router.get("/statistics", Middlewares.verifyToken, (req, res, next) => {
  let todayCompletedTasks = [];
  let todayTasks = [];
  var start = new Date();
  start.setHours(0, 0, 0, 0);

  var end = new Date();
  end.setHours(23, 59, 59, 999);

  Task.find({ updatedAt: { $gte: start, $lt: end } })
    .then((tasks) => {
      todayTasks = tasks;
      todayCompletedTasks = tasks.filter((t) => t.status === TASK_STATUS.DONE);
      res.send({ todayTasks, todayCompletedTasks });
    })
    .catch((e) => console.log(e));
});

router.get("/today", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  var start = new Date();
  start.setHours(0, 0, 0, 0);

  var end = new Date();
  end.setHours(23, 59, 59, 999);

  Task.aggregate([
    {
      $match: {
        lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
        startDate: { $lte: end },
        dueDate: { $gte: start },
        $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
      },
    },
    ...lookupsWithClients,
    {
      $sort: { dueDate: -1 },
    },
  ])
    .then((tasks) => res.send(tasks))
    .catch((e) => next(serverError(e)));
});

router.get("/overdue", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;

  var end = new Date();
  end.setHours(23, 59, 59, 999);

  Task.aggregate([
    {
      $match: {
        lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
        dueDate: { $lte: end },
        $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
      },
    },
    ...lookupsWithClients,
    {
      $sort: { dueDate: -1 },
    },
  ])
    .then((tasks) => res.send(tasks))
    .catch((e) => next(serverError(e)));
});

router.get("/:status", Middlewares.verifyToken, (req, res, next) => {
  const { _id } = res.locals.decoded;
  const { status } = req.params;
  const startDateCondition =
    status === TASK_STATUS.FUTURE ? {} : { startDate: { $lte: new Date() } };
  const statusCondition =
    status === TASK_STATUS.PENDING
      ? {
          $or: [
            { status: TASK_STATUS.PENDING },
            { status: TASK_STATUS.FUTURE },
          ],
        }
      : { status };
  Task.aggregate([
    {
      $match: {
        userIds: { $in: [mongoose.Types.ObjectId(_id)] },
        ...statusCondition,
        ...startDateCondition,
      },
    },
    ...lookups,
    {
      $sort: { createdAt: -1 },
    },
    {
      $limit: 20,
    },
  ])
    .exec()
    .then((tasks) => {
      res.send(tasks);
    })
    .catch((e) => next(serverError(e)));
});

router.get(
  "/future/:assetType/:assetId",
  Middlewares.verifyToken,
  (req, res, next) => {
    Task.aggregate([
      {
        $match: {
          status: TASK_STATUS.FUTURE,
          assetType: req.params.assetType,
          assetId: mongoose.Types.ObjectId(req.params.assetId),
        },
      },
      ...lookups,
    ])
      .exec()
      .then((tasks) => {
        res.send(tasks);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/collection/:assetId",
  Middlewares.verifyToken,
  (req, res, next) => {
    Task.aggregate([
      {
        $match: {
          assetId: mongoose.Types.ObjectId(req.params.assetId),
          type: TASK_TYPE.CREATE_COLLECTION,
        },
      },
      // {
      //   $addFields: {
      //     monthEnd: {
      //       $subtract: [
      //         "$startDate",
      //         { $multiply: [{ $dayOfMonth: "$startDate" }, 86400000] },
      //       ],
      //     },
      //     monthStart: {
      //       $add: [
      //         "$startDate",
      //         {
      //           $multiply: [
      //             { $subtract: [31, { $dayOfMonth: "$startDate" }] },
      //             86400000,
      //           ],
      //         },
      //       ],
      //     },
      //   },
      // },
      // {
      //   $lookup: {
      //     from: "collections",
      //     let: {extra: "$extra", },
      //     pipeline: [
      //       {
      //         $match: {
      //           assetId: mongoose.Types.ObjectId(req.params.assetId),
      //         },
      //       },
      //       {
      //         $match: {
      //           $expr: {
      //             $and: [
      //               { $gte: ["$extra.taskStartDate", "$$monthStart"] },
      //               { $lte: ["$extra.taskStartDate", "$$monthEnd"] },
      //             ],
      //           },
      //         },
      //       },
      //     ],
      //     as: "collections",
      //   },
      // },
      ...lookups,
    ])
      .exec()
      .then((tasks) => {
        res.send(tasks);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get(
  "/:caseId/byDebtor/:debtorId",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;

    Task.aggregate([
      {
        $match: {
          caseId: mongoose.Types.ObjectId(caseId),
          debtorId: mongoose.Types.ObjectId(debtorId),
          $or: [
            { status: TASK_STATUS.PENDING },
            { status: TASK_STATUS.FUTURE },
          ],
        },
      },
      {
        $limit: 50,
      },
      ...lookups,
    ])
      .exec()
      .then((tasks) => {
        res.send(tasks);
      })
      .catch((e) => {
        next(serverError(e));
        console.log(e);
      });
  }
);

router.get("/byId/:taskId", Middlewares.verifyToken, (req, res, next) => {
  Task.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId(req.params.taskId),
      },
    },
    ...lookups,
  ])
    .exec()
    .then((tasks) => {
      res.send(tasks[0]);
    })
    .catch((e) => {
      next(serverError(e));
      console.log(e);
    });
});

router.get(
  "/byCase/:caseId/byDebtor/:debtorId/caseInitialization",
  Middlewares.verifyToken,
  (req, res, next) => {
    const { caseId, debtorId } = req.params;
    Task.find({
      caseId,
      debtorId,
      type: { $in: CASE_INITIALIZATION_TASK_TYPES },
      $or: [{ status: TASK_STATUS.PENDING }, { status: TASK_STATUS.FUTURE }],
    })
      .then((tasks) => {
        res.send(tasks);
      })
      .catch((e) => next(serverError(e)));
  }
);

router.get("/deFacto/preparing", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Task.aggregate([
    {
      $match: {
        lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
        $or: [
          { type: TASK_TYPE.SEIZE_DE_FACTO_REQUIRED },
          { type: TASK_TYPE.CUSTOMS_SEIZE_DE_FACTO_REQUIRED },
        ],
      },
    },
    ...TaskHelper.defaultLookupsWithExecutionOffice,
    {
      $sort: { createdAt: -1 },
    },
  ])
    .then(async (tasks) => {
      for (let i = 0; i < tasks.length; i++) {
        t = tasks[i];
        if (t.debtor[0]) t.debtor = t.debtor[0];
        if (t.currentCase[0]) t.currentCase = t.currentCase[0];
        if (t.type === TASK_TYPE.CUSTOMS_SEIZE_DE_FACTO_REQUIRED) {
          await CustomsDueModel.aggregate([
            {
              $match: { _id: t.assetId },
            },
            {
              $lookup: {
                from: "customsoffices",
                foreignField: "_id",
                localField: "customsOfficeId",
                as: "customsOffice",
              },
            },
          ])
            .then((customsDue) => {
              if (customsDue[0]) {
                customsDue = customsDue[0];
                if (customsDue.customsOffice[0]) {
                  customsDue.customsOffice = customsDue.customsOffice[0];
                  t.customsDue = { ...customsDue };
                }
              }
            })
            .catch((e) => console.log(e));
        } else {
          await NotificationModel.findOne({
            type: constants.NOTIFICATION_TYPE.CASE_INITIALIZATION,
            debtorId: t.debtorId,
            caseId: t.caseId,
            status: constants.NOTIFICATION_STATUS.DONE,
          })
            .then((notification) => {
              t.notification = notification;
            })
            .catch((e) => console.log(e));
        }
        tasks[i] = { ...t };
      }
      await ExecutionOffice.find({ lawOfficeId })
        .then((offices) => {
          res.send({ tasks, executionOffices: offices });
        })
        .catch((e) => next(serverError(e)));
    })
    .catch((e) => next(serverError(e)));
});

router.get("/deFacto/intel", Middlewares.verifyToken, (req, res, next) => {
  const { lawOfficeId } = res.locals.decoded;
  Task.aggregate([
    {
      $match: {
        lawOfficeId: mongoose.Types.ObjectId(lawOfficeId),
        type: TASK_TYPE.FORECLOSABLE_ADDRESS_REQUIRED,
      },
    },
    ...TaskHelper.defaultLookupsWithExecutionOffice,
    {
      $sort: { createdAt: -1 },
    },
  ])
    .then((tasks) => {
      for (let i = 0; i < tasks.length; i++) {
        t = tasks[i];
        if (t.debtor[0]) t.debtor = t.debtor[0];
        if (t.currentCase[0]) t.currentCase = t.currentCase[0];
        tasks[i] = { ...t };
      }
      res.send(tasks);
    })
    .catch((e) => next(serverError(e)));
});

module.exports = router;
