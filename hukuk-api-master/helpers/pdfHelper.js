const fs = require("fs");
const pdf = require("pdf-parse");

const extractPDF = () => {
  let dataBuffer = fs.readFileSync("./pdf/aileNufusKaydi.pdf");
  return pdf(dataBuffer);
};

module.exports = { extractPDF };
