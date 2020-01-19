var express = require('express');
var router = express.Router();
const { Worker } = require('worker_threads');
var fs = require('fs');

/* GET users listing. */
router.get('/data/power/:date', function(req, res, next) {
  fs.access(req.params.date + "/data.json", fs.F_OK, (err) => {
	  if (err) {
	    res.send([]);
	    return
	  }
	  //file exists
	  fs.readFile(req.params.date + "/data.json", "utf-8", (err, data) => {
  		res.send(data);
	  });
  })
});

router.post('/data/power/:date', function(req, res, next) {
  const points = req.body;
  if (!fs.existsSync(req.params.date)){
  	fs.mkdirSync(req.params.date);
  }
  fs.access(req.params.date + "/data.json", fs.F_OK, (err) => {
	  if (!err) {
		    fs.readFile(req.params.date + "/data.json", "utf-8", (err, data) => {
		  	  points.concat(JSON.parse(data));
			  //file exists
			  fs.writeFile(req.params.date + "/data.json", JSON.stringify(points), (err) => {
					if (err) res.status(500).send('Unable to write datas');
				  	res.status(201).send();
			  });
		    });
	  } else {
		  //file exists
		  fs.writeFile(req.params.date + "/data.json", JSON.stringify(points), (err) => {
				if (err) res.status(500).send('Unable to write datas');
			  	res.status(201).send();
		  });
	  }
  });
});

router.post('/data/learn/power/:date', function(req, res, next) {
	// start learning on date
	const worker = new Worker('./services/learning/learningWorker.js', { workerData: req.params.date });
    worker.on('online', () => { console.log('Launching learning task') });
    worker.on('message', messageFromWorker => {
      console.log(messageFromWorker);
    });
    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) {
        console.log(`Learning task stopped with exit code ${code}`);
      }
    });
});

module.exports = router;
