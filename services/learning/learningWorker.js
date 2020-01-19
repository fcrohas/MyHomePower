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
			resolve();
		});
	}

	extractDataRange() {
		return new Promise( (resolve, reject) => {
			let datas = [];

			fs.access(workerData + "/data.json", fs.F_OK, (err) => {
			  if (err) {
			  	reject('Unable to find data at date ' + workerData + 'Error:' + err);
			  }
			  // file exists
			  fs.readFile(workerData + "/data.json", "utf-8", (err, data) => {
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