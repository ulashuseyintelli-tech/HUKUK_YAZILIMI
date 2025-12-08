const ErrorHelper = require("./ErrorHelper"),
  InputValidationHelper = require("./InputValidationHelper"),
  TokenHelper = require("./TokenHelper"),
  UserHelper = require("./UserHelper"),
  TaskHelper = require("./TaskHelper"),
  PDFHelper = require("./pdfHelper");

const getOneMonthLaterWithDay = (day) => {
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  now.setDate(day);
  return now;
};

module.exports = {
  error: ErrorHelper,
  input: InputValidationHelper,
  token: TokenHelper,
  user: UserHelper,
  task: TaskHelper,
  pdf: PDFHelper,
  getOneMonthLaterWithDay,
};
