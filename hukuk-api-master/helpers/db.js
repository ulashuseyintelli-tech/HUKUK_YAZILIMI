const mongoose = require("mongoose");

module.exports = () => {
  mongoose.connect(app.get("DB_URL"));

  mongoose.connection.on("open", () => {
    console.log("MongoDB: Connected");
  });
  mongoose.connection.on("error", (err) => {
    console.log("MongoDB: Error", err);
  });

  mongoose.Promise = Promise;
  return mongoose.connection;
};
