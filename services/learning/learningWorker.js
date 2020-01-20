const { workerData, parentPort } = require('worker_threads')
const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');
const Store = require('../db/influxdb-store.js');

class MachineLearning {
	constructor() {
		const config = JSON.parse(fs.readFileSync("./config.json", 'utf8'))
		this.store = new Store(config);
		this.store.connect().then(() => {
			return this.extractDataRange();
		}).then( (dataTags) => {
			return this.createDataset(dataTags);
		}).then( () => {
			return this.learn();
		}).then( (result) => {
			parentPort.postMessage('Learning done !');
		}).catch((e) => console.log('Error=',e));
	}

	createDataset(dataTags) {
		return new Promise( (resolve, reject) => {
			const today = new Date(workerData);
			today.setHours(0);
			today.setMinutes(0);
			today.setSeconds(0);
			today.setMilliseconds(0);
			this.currentDayOfMonth = today.toISOString();
			today.setDate(today.getDate() + 1);
			this.tomorrowDayOfMonth = today.toISOString();
			// select power range
			this.store.findPowerByRange(this.currentDayOfMonth, this.tomorrowDayOfMonth, '1m').then ( (points) => {
				// Merge point with tagged data
				console.log( 'Point(0)', points[0],'tags=',dataTags[0]);

				resolve();
			}).catch( (err) => {
				reject(err);
			});
		});
	}

	extractDataRange() {
		return new Promise( (resolve, reject) => {
			let datas = [];
			fs.access("datas/" + workerData + "/data.json", fs.F_OK, (err) => {
			  if (err) {
			  	reject('Unable to find data at date ' + workerData + 'Error:' + err);
			  }
			  // file exists
			  fs.readFile("datas/" + workerData + "/data.json", "utf-8", (err, data) => {
				data = JSON.parse(data);
				console.log('datas=', data);
				resolve(data);
			  });
			})

		});
	}

	learn() {
		return new Promise( (resolve, reject) => {
			const model = tf.sequential();
			model.add(tf.layers.dense({ units: 1, inputShape: [200] }));
			model.compile({
			  loss: 'meanSquaredError',
			  optimizer: 'sgd',
			  metrics: ['MAE']
			});

			// Generate some random fake data for demo purpose.
			const xs = tf.randomUniform([10000, 200]);
			const ys = tf.randomUniform([10000, 1]);
			const valXs = tf.randomUniform([1000, 200]);
			const valYs = tf.randomUniform([1000, 1]);


			// Start model training process.
			async function train() {
			  await model.fit(xs, ys, {
			    epochs: 100,
			    validationData: [valXs, valYs],
			    // Add the tensorBoard callback here.
			    callbacks: tf.node.tensorBoard('/tmp/fit_logs_1')
			  });
			}
			train().then( () => {
				resolve();
			});
		});
	}
}

module.exports = new MachineLearning();