var express = require('express');
var router = express.Router();
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
  fs.access(req.params.date + "/data.json", fs.F_OK, (err) => {
	  if (!err) {
		    fs.readFile(req.params.date + "/data.json", "utf-8", (err, data) => {
		  	  points.concat(JSON.parse(data));
		  	  console.log('file read', points);
			  //file exists
			  fs.writeFile(req.params.date + "/data.json", JSON.stringify(points), (err) => {
					if (err) res.status(500).send('Unable to write datas');
					console.log("Successfully Written to File.");
				  	res.status(201).send();
			  });
		    });
	  } else {
		  //file exists
		  fs.writeFile(req.params.date + "/data.json", JSON.stringify(points), (err) => {
				if (err) res.status(500).send('Unable to write datas');
				console.log("Successfully Written to File.");
			  	res.status(201).send();
		  });
	  }
  });
});

module.exports = router;
