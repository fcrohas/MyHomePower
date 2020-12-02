var express = require('express');
var router = express.Router();
const { Worker } = require('worker_threads');
var fs = require('fs');
const machinePredict = require('../services/learning/learningWorker.js');
/* Clean duplicate datas. */
router.get('/data/power/clean/:date', function(req, res, next) {
  fs.access("datas/" + req.params.date + "/data.json", fs.F_OK, (err) => {
	  if (err) {
	    res.send([]);
	    return
	  }
	  //file exists
	  fs.readFile("datas/" + req.params.date + "/data.json", "utf-8", (err, data) => {
		//file exists
		const datas = JSON.parse(data);
		const filter = [];
		datas.forEach( d => {
			let exist = false;
			filter.forEach( f => {
				if (f.start == d.start && f.end == d.end && f.tags == d.tags) {
					exist = true;
				}
			});
			if (!exist) {
				filter.push(d);
			}
		});
		fs.writeFile("datas/" + req.params.date + "/data.json", JSON.stringify(filter), (err) => {
			if (err) res.status(500).send('Unable to write datas');
		  	res.status(200).send({added: 0, updated: 0, deleted: data.length - filter.length});
		});
	  });
  })
});

/* GET power points listing. */
router.get('/data/power/:date', function(req, res, next) {
  fs.access("datas/" + req.params.date + "/data.json", fs.F_OK, (err) => {
	  if (err) {
	    res.send([]);
	    return
	  }
	  //file exists
	  fs.readFile("datas/" + req.params.date + "/data.json", "utf-8", (err, data) => {
  		res.send(data);
	  });
  })
});

router.delete('/data/power/:date', function(req, res, next) {
  let point = req.body;
  if (!fs.existsSync("datas/" + req.params.date)){
  	fs.mkdirSync("datas/" + req.params.date);
  }
  fs.access("datas/" + req.params.date + "/data.json", fs.F_OK, (err) => {
	  if (!err) {
		    fs.readFile("datas/" + req.params.date + "/data.json", "utf-8", (err, data) => {
		      const source = JSON.parse(data);
		  	  const filtered = source.filter(f => f.start!==point.start || f.end!==point.end);
		  	  let deleted = source.length - filtered.length;
		  	  console.log('Delete point', JSON.stringify(point), 'deleted', deleted);
			  //file exists
			  fs.writeFile("datas/" + req.params.date + "/data.json", JSON.stringify(filtered), (err) => {
					if (err) res.status(500).send('Unable to write datas');
				  	res.status(200).send({added: 0, updated: 0, deleted: deleted});
			  });
		    });
	  }
  });
});

router.post('/data/power/:date', function(req, res, next) {
  let points = req.body;
  let updateCount = 0;
  let addCount = 0;
  if (!fs.existsSync("datas/" + req.params.date)){
  	fs.mkdirSync("datas/" + req.params.date);
  }
  fs.access("datas/" + req.params.date + "/data.json", fs.F_OK, (err) => {
	  if (!err) {
		    fs.readFile("datas/" + req.params.date + "/data.json", "utf-8", (err, data) => {
		      // filter and update
		      let loaded = JSON.parse(data);
		  	  const filtered = points.filter( f => {
		  	  	let found = false;
		  	  	loaded.forEach( d => {
		  	  		if (d.start===f.start && d.end===f.end) {
		  	  			found = true;
		  	  			if (d.tags !== f.tags) {
		  	  				d.tags = f.tags;
		  	  				updateCount++;
		  	  			}
		  	  		}
		  	  	});
		  	  	return !found;
		  	  });
		  	  loaded = loaded.concat(filtered);
		  	  addCount = filtered.length;
			  //file exists
			  fs.writeFile("datas/" + req.params.date + "/data.json", JSON.stringify(loaded), (err) => {
					if (err) res.status(500).send('Unable to write datas');
				  	res.status(201).send({added: addCount, updated: updateCount, deleted: 0});
			  });
		    });
	  } else {
		  //file exists
		  fs.writeFile("datas/" + req.params.date + "/data.json", JSON.stringify(points), (err) => {
				if (err) res.status(500).send('Unable to write datas');
			  	res.status(201).send({added: points.length, updated: 0, deleted: 0});
		  });
	  }
  });
});

router.post('/data/learn/power/:date', function(req, res, next) {
	// start learning on date
	const worker = new Worker('./services/learning/learningWorker.js', { workerData: req.params.date });
    worker.on('online', () => { console.log('Launching learning task') });
    worker.on('message', messageFromWorker => {
      //console.log(messageFromWorker);
      router.io.emit("customEmit", messageFromWorker);
    });
    worker.on('error', reject);
    worker.on('exit', code => {
      if (code !== 0) {
        console.log(`Learning task stopped with exit code ${code}`);
      }
    });
});

router.get('/data/predict/power-devices/:from/:to', function(req, res, next) {
	if (!machinePredict.isLoaded()) {
		machinePredict.load().then( () => {
			machinePredict.predict(req.params.from, req.params.to).then( (datas) => {
				res.send(datas);
			});
		});
	} else {
		machinePredict.predict(req.params.from, req.params.to).then( (datas) => {
			res.send(datas);
		});
	}
});

router.post('/data/valid/power/:date', function(req, res, next) {
	if (!machinePredict.isLoaded()) {
		machinePredict.load().then( () => {
			machinePredict.validationDataset(req.params.date).then( (datas) => {
				res.send(datas);
			});
		});
	} else {
		machinePredict.validationDataset(req.params.date).then( (datas) => {
			res.send(datas);
		});
	}
});

module.exports = router;
