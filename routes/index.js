const express = require('express');
const Linky = require ('../services/linky.js');
const Store = require ('../services/db/influxdb-store.js');
const router = express.Router();

const fs = require('fs');
const Path = require('path');
// Prepare
const config = JSON.parse(fs.readFileSync("./config.json", 'utf8'))
const store = new Store(config);
const linky = new Linky({ device: '/dev/ttyUSB0'}, store);

store.connect().then(() => {
	linky.initialize();
}).catch((e) => console.log('Error=',e));

/* GET home page. */
router.get('/read/linky', function(req, res, next) {
  res.send(linky.getState());
});

module.exports = router;
