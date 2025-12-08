const { Types } = require("mongoose");
const { TASK_TYPE, ASSET_TYPE, DEBTOR_TYPE } = require("../constants");
const BankQueryModel = require("../models/BankQueryModel");
const DebtorModel = require("../models/DebtorModel");
const LawOfficeModel = require("../models/LawOfficeModel");
const QueryModel = require("../models/QueryModel");
const { createBankTasks } = require("./BankQueryHelper");
const { createQueryTask, createTask } = require("./TaskHelper");

const createQueryBulk = (res, caseId, debtorId) => {
  const office = res.locals.lawOffice;
  DebtorModel.aggregate([
    {
      $match: { _id: Types.ObjectId(debtorId) },
    },
    {
      $lookup: {
        from: "foreclosableaddresses",
        pipeline: [
          {
            $match: {
              caseId: Types.ObjectId(caseId),
              debtorId: Types.ObjectId(debtorId),
            },
          },
        ],
        as: "foreclosableAddresses",
      },
    },
  ]).then((debtor) => {
    debtor = debtor[0];
    if (debtor.foreclosableAddresses.length > 0) {
      createTask(
        res,
        { caseId, debtorId },
        {
          type: TASK_TYPE.SEIZE_DE_FACTO_REQUIRED,
          assetType: ASSET_TYPE.DE_FACTO,
          assetId: debtor.foreclosableAddresses[0]._id,
        }
      ).catch((e) => console.log(e));
    } else if (
      res.locals.lawOffice.deFactoIntelRequired &&
      debtor.addresses.length > 0
    ) {
      createTask(
        res,
        { caseId, debtorId },
        {
          type: TASK_TYPE.FORECLOSABLE_ADDRESS_REQUIRED,
          assetType: ASSET_TYPE.DE_FACTO,

          extra: {
            address: debtor.addresses[0],
          },
        }
      ).catch((e) => console.log(e));
    }
    office.queryList.map((query) => {
      if (query === "BANK") {
        createBankQueryBulk(
          caseId,
          debtorId,
          office.bulkQueryBankList || [],
          { params: { property: null }, body: { propertyValue: null } },
          res
        );
      } else {
        if (
          (query !== ASSET_TYPE.FAMILY_REGISTER && query !== ASSET_TYPE.SSI) ||
          debtor.type === DEBTOR_TYPE.PERSON
        ) {
          QueryModel.create({ caseId, debtorId, type: query })
            .then((query) => {
              createQueryTask(res, query);
            })
            .catch((e) => console.log(e));
        }
      }
    });
  });
};

const createBankQueryBulk = async (caseId, debtorId, bankList, req, res) => {
  const bankQueryList = [];
  for (let i = 0; i < bankList.length; i++) {
    await BankQueryModel.create({ bankName: bankList[i], caseId, debtorId })
      .then((bankQuery) => {
        bankQueryList.push(bankQuery);
        createBankTasks(req, res, bankQuery);
      })
      .catch((e) => console.log(e));
  }
  return bankQueryList;
};

module.exports = { createQueryBulk, createBankQueryBulk };
