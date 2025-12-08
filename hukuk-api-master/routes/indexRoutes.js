const express = require('express'),
      router  = express.Router();

router.get("/", (req, res, next) => {
  res.send('<h1>Node-starter</h1>')
})

module.exports = router;