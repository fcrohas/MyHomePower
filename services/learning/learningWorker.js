const { workerData, parentPort } = require('worker_threads')
const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');
const Store = require('../db/influxdb-store.js');

class MachineLearning {
	constructor() {
		const config = JSON.parse(fs.readFileSync("./config.json", 'utf8'));
		this.model = null;
		this.labels = null;
		this.store = new Store(config);
		this.maxTags = 7;
		this.inputMax = 10000;
		this.inputMin = 340;  
		this.outputMax = 8192;
		this.outputMin = 0;
		this.MIN_IN_CLASS = 200;
		this.CLASS_COUNT = 14;
		this.WINDOW_SIZE = 60;
		this.TIMESTEPS = 6;
		this.tags = ['radiateur','chauffe-eau','frigo','lave-vaisselle','lave-linge','four','plaque-cuisson','audiovisuel','climatiseur','soufflant','micro-onde','tele','ps4','veille'].reverse();
		if (parentPort != null) {
			this.start();
		} else {
			this.store.connect().then( () => {
				console.log('Connected to database !');
			});
		}
	}

	start() {
		this.store.connect().then(() => {
			const today = new Date(workerData);
			today.setHours(0);
			today.setMinutes(0);
			today.setSeconds(0);
			today.setMilliseconds(0);
			this.currentDayOfMonth = today.toISOString();
			const tomorrow = new Date(workerData);
			tomorrow.setHours(0);
			tomorrow.setMinutes(0);
			tomorrow.setSeconds(0);
			tomorrow.setMilliseconds(0);
			tomorrow.setDate(tomorrow.getDate() + 5);
			this.tomorrowDayOfMonth = tomorrow.toISOString();
			console.log('Extract from', this.currentDayOfMonth, 'to', this.tomorrowDayOfMonth);
			const promise = [];
		    promise.push( this.extractDataRange(this.formatDate(today)));
			for (let i = 0; i < 5; i++) {
			   today.setDate(today.getDate() + 1);
			   console.log('Promise',i,' extract date', this.formatDate(today));
			   promise.push( this.extractDataRange(this.formatDate(today)));
			}
			return Promise.all(promise);
		}).then( (results) => {
			let dataTags = [];
			let labels = [];
		    results.forEach( r => {
			   	dataTags = dataTags.concat(r.datas);
			   	r.labels.forEach( rLabel => {
			   		if (labels.indexOf(rLabel) == -1)  {
			   	 			labels.push(rLabel);
			   		}
			   });
			});
			return { datas: dataTags, labels: labels };
		}).then((dataTags) => {
			return this.createDataset(dataTags);
		}).then( (dataSet) => {
			return this.learn(dataSet);
		}).then( (result) => {
			parentPort.postMessage('Learning done !');
		}).catch((e) => console.log('Error=',e));
	}

	tagsToNumeric(value) {
		let result = 0;
		if (value === undefined) {
			return result;
		}
		const values = value.split(' ');
		const filtered = [];
		values.forEach(v => {
			if (filtered.indexOf(v) === -1) {
				filtered.push(v);
			}
		});
		for (let i = 0; i < filtered.length; i++) {
			switch(filtered[i]) {
				case 'radiateur' :
					result += 1; 
					break;
				case 'chauffe-eau' :
					result += 2; 
					break;
				case 'frigo' :
					result += 4; 
					break;
				case 'lave-vaisselle' :
					result += 8; 
					break;
				case 'lave-linge' :
					result += 16; 
					break;
				case 'four' :
					result += 32; 
					break;
				case 'plaque-cuisson' :
					result += 64; 
					break;
				case 'cafetiere' :
					result += 128; 
					break;
				case 'climatiseur' :
					result += 256; 
					break;
				case 'soufflant' :
					result += 512; 
					break;
				case 'micro-onde' :
					result += 1024; 
					break;
				case 'tele' :
					result += 2048; 
					break;
				case 'ps4' :
					result += 4096;
					break;
				case 'veille' :
					result += 0;
					break;
			}
		}
		return result;
	}

	predictTag(predict, mask) {
		const outputTags = [];
		for (let i = 0; i < this.tags.length; i++) {
			if (Math.round(predict[i] * 100)>1) {
				outputTags.push({
					name: this.tags[i], 
					percent: Math.round(predict[i] * 100.0), 
					mask: mask.slice(i * this.WINDOW_SIZE, i * this.WINDOW_SIZE + this.WINDOW_SIZE)
				});
			}
		}
		return outputTags;
	}

	predictMask(mask) {
		const outputTags = [];
		for (let i = 0; i < this.WINDOW_SIZE * this.CLASS_COUNT; i += this.WINDOW_SIZE) {
			// Average window
			const classMask = mask.slice(i, i + this.WINDOW_SIZE);
			const filtered = classMask.filter( v => v >= 0.5);
			if (filtered.length == 0) {
				continue;
			}
			const average = filtered.reduce( (a,b) => a+b) / filtered.length * 100.0;
			if (Math.round(average) > 5) {
				// console.log('class', this.tags[i / this.WINDOW_SIZE], 'percent', Math.round(average), 'mask', classMask.map( value => (value>0.5)?1:0));
		    	console.log('classMask', classMask,'name', this.labels[i / this.WINDOW_SIZE]);
				outputTags.push({
					name: this.labels[i / this.WINDOW_SIZE], 
					percent: Math.round(average), 
					mask: classMask.map( value => (value >= 0.5)?1:0)
				});
			}
		}
		return outputTags;
	}

	formatDate(date) {
	  var mm = date.getMonth() + 1; // getMonth() is zero-based
	  var dd = date.getDate();

	  return [date.getFullYear(),
	          (mm>9 ? '' : '0') + mm,
	          (dd>9 ? '' : '0') + dd
	         ].join('-');
	}

	validationDataset(date) {
		return new Promise( (resolve, reject) => {
			return this.extractDataRange(date).then( (dataTags) => {
				const today = new Date(date);
				today.setHours(0);
				today.setMinutes(0);
				today.setSeconds(0);
				today.setMilliseconds(0);
				const tomorrow = new Date(date);
				tomorrow.setHours(0);
				tomorrow.setMinutes(0);
				tomorrow.setSeconds(0);
				tomorrow.setMilliseconds(0);
				tomorrow.setDate(tomorrow.getDate() + 1);
				// generate all point for day
				const dayDatas = [];
				for (let i = 0; i < 60 * 24; i++) {
					dayDatas.push(0);
				}
				const start = today.valueOf();
				// select power range
				this.predict(today.toISOString(), tomorrow.toISOString()).then( predictions => {
					predictions.forEach( pred => {
	                  const startRange = new Date(start + (pred.index * 60000 * pred.mask.length));
	                  const endRange = new Date(start + (pred.index * 60000 * (pred.mask.length)));
				  	  // look for precise matching
				  	  // One tag only per time pred
				  	  pred.accuracy = [];
				  	  for (let i=0; i < pred.mask.length; i++) {
				  	  	pred.accuracy[i] = pred.mask[i];
				  	  }
				  	  pred.mask.forEach( (v,idx) => {
				  	  	const value = new Number(v);
				  	 	const time = new Date(idx * 60000 + startRange.valueOf());
				  	 	dataTags.forEach( tag => {
						  	const tagStart = new Date(tag.start);
						  	const tagEnd = new Date(tag.end);
						  	// check that pred is in
				  	 		if ((tag.tags.indexOf(pred.name) != -1) && time>=tagStart && time<= tagEnd) {
				  	 			pred.accuracy[idx] += 1; 
				  	 		}
				  	 	});
				  	  });
					  if (pred.accuracy) {
					  	console.log('Name ' + pred.name + ' index ' + pred.index +' accuracy ' + pred.accuracy.join(''));
					  }
					});
					// Missed prediction

					resolve(predictions);
		        });
			});
		});
	}

	createDataset(dataTags) {
		let maxTags = 0;
		this.CLASS_COUNT = dataTags.labels.length;
		return new Promise( (resolve, reject) => {
			const dataset = [];
			// select power range
			this.store.findPowerByRange(this.currentDayOfMonth, this.tomorrowDayOfMonth, '1m').then ( (points) => {
				// Merge point with tagged data
				for(let index=0; index<points.length - this.WINDOW_SIZE; index++) {
				     let inputs = [];
				     let outputs = [];
				     let masks = [];
				     let maskByTag = [];
				     // All available tag in window
				     let tagList = [];
			         let tagCount = 0;
				     // prepare datas
				     // Generate WINDOW_SIZE points from this one
				     for (let x=0; x < this.WINDOW_SIZE; x++) {
			             const movingPoint = points[index + x];
			             const time = movingPoint.time;
			             // push kva input
			             inputs.push(movingPoint.powerkva);
			             // Check if current point is inside a tag
			             dataTags.datas.forEach( (dataTag) => {
			                  const tagStartTime = new Date(dataTag.start);
			                  const tagEndTime = new Date(dataTag.end);
			                  if ((time >= tagStartTime) && (time <= tagEndTime)) {
			                  	// not standby
			                  	if (dataTag.tags.indexOf('veille')===-1) {
			                  		const tags = dataTag.tags.split(' ');
			                  		tags.forEach( t => {
			                  			if (tagList.indexOf(t) === -1) {
			                  				tagList.push(t);
			                  			}
			                  		});
			                  	}
			                  }
			              });
				     }
				     if (tagList.length>maxTags) {
				     	maxTags = tagList.length;
				     }
				     tagCount = tagList.length;
				     let tagOut = '';
				     while(tagList.length>0) {
				     	 let tag = tagList.shift();
				     	 let mask = [];
					     for (let x=0; x < this.WINDOW_SIZE; x++) {
					             const movingPoint = points[index + x];
					             const time = movingPoint.time;
					             // Check if current point is inside a tag
					             let tagged = false;
					             dataTags.datas.forEach( (dataTag) => {
					                  const tagStartTime = new Date(dataTag.start);
					                  const tagEndTime = new Date(dataTag.end);
					                  if ((time >= tagStartTime) && (time <= tagEndTime)) {
					                  	   if (dataTag.tags.indexOf(tag)!==-1) {
							                  tagged = true;
							       		   } else {
							       		   	  tagged = false;
							       		   }
					                       //outputs.push(this.tagsToNumeric(dataTag.tags));
					                  }
					             });
					             if (!tagged) {
					             	mask.push(0);
					                //outputs.push(0);
					             } else {
									mask.push(1);				             	
					             }
					      }
					      maskByTag[tag] = mask;
					      if (tagOut =='') {
					      	 tagOut = tag;
					      } else {
					         tagOut = tagOut + ' ' + tag;
					  	  }
				  	  }
				  	  // while (outputs.length < this.CLASS_COUNT * this.maxTags) {
				  	  // 	// add ending 0
				  	  // 	outputs.push(0); 
				  	  // }
				      outputs = this.tagsToNumeric(tagOut).toString(2).padStart(this.CLASS_COUNT,'0').split('').map(val => parseInt(val,2));
				  	  // while (masks.length < this.WINDOW_SIZE * this.maxTags) {
				  	  // 	// add ending 0
				  	  // 	masks.push(0); 
				  	  // }
				  	  // Use labels from dataset
				  	  //this.tags.forEach( t => {
				  	  dataTags.labels.forEach( t => {
				  	  	if (maskByTag[t]!== undefined) {
				  	  		masks = masks.concat(maskByTag[t]);
				  	  	} else {
							masks = masks.concat('0'.padStart(this.WINDOW_SIZE, '0').split('').map(val => parseInt(val,2)));
				  	  	}
				  	  });

				      dataset.push({in: inputs, out: outputs, mask: masks, labels: dataTags.labels});
				   //    if (tagCount == 2) {
						 // console.log('inputs', inputs);
						 // console.log('outputs', outputs);
						 // console.log('masks', masks.slice(11 * this.WINDOW_SIZE, 11 * this.WINDOW_SIZE + this.WINDOW_SIZE * tagCount));
				   //    }
			    }	
			    console.log('maxTags found in window of ', this.WINDOW_SIZE, ' points is ', maxTags);
			    parentPort.postMessage('Dataset generated for ' + this.currentDayOfMonth);
				resolve(dataset);
			}).catch( (err) => {
				reject(err);
			});
		});
	}

	extractDataRange(date) {
		return new Promise( (resolve, reject) => {
			let datas = [];
			fs.access("datas/" + date + "/data.json", fs.F_OK, (err) => {
			  if (err) {
			  	reject('Unable to find data at date ' + date + 'Error:' + err);
			  }
			  // file exists
			  fs.readFile("datas/" + date + "/data.json", "utf-8", (err, data) => {
				data = JSON.parse(data);
				// Filter datas
				console.log('Extract of ', date,' started');
				const filter = [];
				data.forEach( d => {
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
				// Compute distinct tags for day
				const tags = [];
				filter.forEach( f => {
					const fTags = f.tags.split(' ');
					fTags.forEach ( ft => {
						if (tags.indexOf(ft) == -1) {
							tags.push(ft);
						}
					});
				});
				// save tags label for day
				fs.writeFile("datas/" + date + "/label.json", JSON.stringify(tags), (err) => {
					console.log('On ', date, ' Check & filter duplicate ', data.length,' / ', filter.length, 'labels count', tags.length);
					parentPort.postMessage('On ' + date + ' extract ' + filter.length + ' data with ' + tags.length + ' labels');
					resolve({datas: filter, labels: tags});
				});
			  });
			})
		});
	}

	createModelV1() {
	    const window_size = this.WINDOW_SIZE;
	    const n_layers = 4;
	    const input_layer_shape  = window_size;
	    const input_layer_neurons = 100;

	    const rnn_input_layer_features = 20;
	    const rnn_input_layer_timesteps = input_layer_neurons / rnn_input_layer_features;
	   
	    const rnn_input_shape  = [ rnn_input_layer_timesteps, rnn_input_layer_features ];
	    const rnn_output_neurons = 20;

	    const rnn_batch_size = window_size;
	 
	    const output_layer_shape = rnn_output_neurons;
	    const output_layer_neurons = this.CLASS_COUNT;

		const model = tf.sequential();
	    model.add(tf.layers.dense({units: input_layer_neurons, inputShape: [input_layer_shape], activation: 'relu', useBias: true}));
	    model.add(tf.layers.reshape({targetShape: rnn_input_shape}));

	    var lstm_cells = [];
	    for (let index = 0; index < n_layers; index++) {
	         lstm_cells.push(tf.layers.lstmCell({units: rnn_output_neurons}));           
	    }

	    model.add(tf.layers.rnn({cell: lstm_cells,
	 		inputShape: rnn_input_shape, returnSequences: false, dropout: 0.2}));
	    model.add(tf.layers.dense({units: rnn_output_neurons}));
	    model.add(tf.layers.dense({units: output_layer_neurons, 
	    						   inputShape: [output_layer_shape], 
	    						   activation: 'sigmoid', useBias: true}));

		return model;		
	}

	createModelLSTMOnly() {
		var model = tf.sequential();
	    var lstm_cells = [];
	    for (let index = 0; index < 8; index++) {
	         lstm_cells.push(tf.layers.lstmCell({units: 20}));           
	    }

	    model.add(tf.layers.rnn({cell: lstm_cells,
	 		inputShape: [1, this.WINDOW_SIZE], returnSequences: false, dropout: 0.2}));
	    model.add(tf.layers.dense({units: 80}));
		model.add(tf.layers.dense({units: this.CLASS_COUNT, activation: 'sigmoid'}));
		return model;		
	}

	createModelCNNLSTM() {
		/*const cnn = tf.sequential({name: 'cnn_per_time_step'});
		cnn.add(tf.layers.reshape({inputShape: [this.TIMESTEPS], targetShape:[this.TIMESTEPS,1]}));
        cnn.add(tf.layers.conv1d({
            kernelSize: 3,
            filters: 64,
            strides: 1,
            use_bias: true,
            activation: 'relu',
            kernelInitializer: 'VarianceScaling'
        }));
        cnn.add(tf.layers.maxPooling1d({
            poolSize: [2],
            strides: [1]
        }));
        cnn.add(tf.layers.batchNormalization());
        //cnn.add(tf.layers.dense({units: 64}));
        //cnn.add(tf.layers.dense({units: 64}));
        cnn.add(tf.layers.dropout({rate: 0.2}));
        // cnn.add(tf.layers.conv1d({
        //     kernelSize: 3,
        //     filters: 64,
        //     strides: 1,
        //     use_bias: true,
        //     activation: 'relu',
        //     kernelInitializer: 'VarianceScaling'
        // }));
        // cnn.add(tf.layers.maxPooling1d({
        //      poolSize: [2],
        //      strides: [1]
        // }));
        // cnn.add(tf.layers.batchNormalization());
        cnn.add(tf.layers.flatten({}));
        // cnn.add(tf.layers.timeDistributed({ layer: tf.layers.flatten({})}));
        cnn.build();*/
        const model = tf.sequential({name: 'lstm_layer'});
        model.add(tf.layers.timeDistributed({ layer: this.createModelCNN(), inputShape: [this.WINDOW_SIZE / this.TIMESTEPS, this.TIMESTEPS]}));
		model.add(tf.layers.lstm({units: 50, returnSequences: true}));
        model.add(tf.layers.dropout({rate: 0.2}));
        // model.add(tf.layers.lstm({units: 8, returnSequences: false}))
        model.add(tf.layers.flatten({}));
        model.add(tf.layers.dense({units: this.WINDOW_SIZE * this.CLASS_COUNT * 2}));
        model.add(tf.layers.dense({units: this.WINDOW_SIZE * this.CLASS_COUNT, activation: 'sigmoid'}));
        model.summary();
        return model;
	}

	createModelCNNWithMask() {
		const input = tf.input({shape:[this.WINDOW_SIZE, 1]});
		/********************/
		const stage1_conv1d_mask = tf.layers.conv1d({
            kernelSize: 7,
            filters: 128,
            strides: 1,
            use_bias: true,
            activation: 'relu',
            kernelInitializer: 'VarianceScaling'
        }).apply(input);
		// Add the Average Pooling layer
        const avg1_pool_mask = tf.layers.averagePooling1d({
            poolSize: [2],
            strides: [1]
        }).apply(stage1_conv1d_mask);
        const norm_1 = tf.layers.batchNormalization().apply(avg1_pool_mask);
        // Add the second convolutional layer
        const stage2_conv1d_mask = tf.layers.conv1d({
            kernelSize: 5,
            filters: 64,
            strides: 1,
            use_bias: true,
            activation: 'relu',
            kernelInitializer: 'VarianceScaling'
        }).apply(norm_1);

        // Add the Average Pooling layer
        const avg2_pool_mask = tf.layers.averagePooling1d({
            poolSize: [2],
            strides: [1]
        }).apply(stage2_conv1d_mask);
        const norm_2 = tf.layers.batchNormalization().apply(avg2_pool_mask);

        // Add the second convolutional layer
        const stage3_conv1d_mask = tf.layers.conv1d({
            kernelSize: 3,
            filters: 32,
            strides: 1,
            use_bias: true,
            activation: 'relu',
            kernelInitializer: 'VarianceScaling'
        }).apply(norm_2);

        // Add the Average Pooling layer
        const avg3_pool_mask = tf.layers.averagePooling1d({
            poolSize: [2],
            strides: [1]
        }).apply(stage3_conv1d_mask);
		/*********************/
        const norm_3 = tf.layers.batchNormalization().apply(avg3_pool_mask);

        // Add special output that mask tagged input
        const flatten1 = tf.layers.flatten({}).apply(norm_3);
		const denseHide1 = tf.layers.dense({units: this.WINDOW_SIZE * this.CLASS_COUNT}).apply(flatten1);
		const mask = tf.layers.dense({units: this.WINDOW_SIZE * this.CLASS_COUNT, activation: 'sigmoid'}).apply(denseHide1);

        // Add Flatten layer, reshape input to (number of samples, number of features)
  //       const flatten2 = tf.layers.flatten({}).apply(avg3_pool);
		// const denseHide2 = tf.layers.dense({units: this.CLASS_COUNT}).apply(flatten2);
		// const classe = tf.layers.dense({units: this.CLASS_COUNT, activation: 'sigmoid'}).apply(denseHide2);
		return tf.model({inputs: input, outputs: mask});	
	}

	createModelCNN() {
		var model = tf.sequential();
		model.add(tf.layers.reshape({inputShape: [this.TIMESTEPS], targetShape:[this.TIMESTEPS,1]}));
		model.add(tf.layers.conv1d({
			//inputShape: [this.WINDOW_SIZE, 1],
            kernelSize: 2,
            filters: 18,
            strides: 1,
            use_bias: true,
            activation: 'relu',
            kernelInitializer: 'VarianceScaling'
        }));
		// Add the Average Pooling layer
        model.add(tf.layers.maxPooling1d({
            poolSize: [2],
            strides: [2],
            padding: 'same'
        }));

        // Add the second convolutional layer
        model.add(tf.layers.conv1d({
            kernelSize: 2,
            filters: 36,
            strides: 1,
            use_bias: true,
            activation: 'relu',
            kernelInitializer: 'VarianceScaling',
            padding: 'same'
        }));

        // Add the Average Pooling layer
        model.add(tf.layers.maxPooling1d({
            poolSize: [2],
            strides: [2],
            padding: 'same'
        }));

        // Add the second convolutional layer
        model.add(tf.layers.conv1d({
            kernelSize: 2,
            filters: 72,
            strides: 1,
            use_bias: true,
            activation: 'relu',
            kernelInitializer: 'VarianceScaling',
            padding: 'same'
        }));

        // Add the Average Pooling layer
        model.add(tf.layers.maxPooling1d({
            poolSize: [2],
            strides: [2],
            padding: 'same'
        }));

        model.add(tf.layers.conv1d({
            kernelSize: 2,
            filters: 144,
            strides: 1,
            use_bias: true,
            activation: 'relu',
            kernelInitializer: 'VarianceScaling',
            padding: 'same'
        }));

        // Add the Average Pooling layer
        model.add(tf.layers.maxPooling1d({
            poolSize: [2],
            strides: [2],
            padding: 'same'
        }));

        // Add Flatten layer, reshape input to (number of samples, number of features)
        model.add(tf.layers.flatten({}));
        model.add(tf.layers.dropout({rate: 0.2}));
		model.add(tf.layers.dense({units: this.WINDOW_SIZE * this.CLASS_COUNT, activation: 'relu'}));
		return model;		
	}

	onEpochEnd(epoch, logs) {
		parentPort.postMessage(logs);
	}

	onTrainBegin(logs) {
		parentPort.postMessage(logs);
	}

	learn(dataset) {
		return new Promise( (resolve, reject) => {
			//const model = this.createModelCNNWithMask();
			//const model = this.createModelCNN();
			const model = this.createModelCNNLSTM();
			const LEARNING_RATE = 0.001;
			const optimizer = tf.train.adam(LEARNING_RATE);
			model.compile({
				optimizer: optimizer,
			    	//loss: tf.losses.meanSquaredError,
			    	//loss: 'sparseCategoricalCrossentropy',
			    	metrics: ['accuracy'],
				//loss: 'categoricalCrossentropy',
				//loss: ['binaryCrossentropy', 'binaryCrossentropy']
				loss: 'binaryCrossentropy'
			});
			console.log('dataset size', dataset.length);
			/*
			let outCount = [];
			for (let i=0; i<this.CLASS_COUNT; i++) outCount[i]=0;
			// filter and limit to output count
			dataset.forEach( ds => {
				// sum ouput
				ds.out.forEach( (val, index) => {
					if (val !== undefined) {
						outCount[index] += val;
					}
				});
			});
			// found minimum representative
			let minCount = 99999;
			for (let i=0; i<this.CLASS_COUNT; i++) {
				if ((outCount[i]>this.MIN_IN_CLASS) && (outCount[i] < minCount)) {
					minCount = outCount[i];
				}
			}
			if (minCount == 99999) {
				minCount = this.MIN_IN_CLASS;
			}
			console.log( "before balance", outCount);
			let filtered = [];
			// balance data to minimum
			for (let i=0; i<this.CLASS_COUNT; i++) {
				if (outCount[i] <= minCount) {
					const limit = dataset.filter( ds => ds.out[i] != 0);
					filtered = filtered.concat(limit);
				}
			}
			//
			for (let i=0; i<this.CLASS_COUNT; i++) outCount[i]=0;
			filtered.forEach( ds => {
				// sum ouput
				ds.out.forEach( (val, index) => {
					if (val !== undefined) {
						outCount[index] += val;
					}
				});
			});
			console.log( "intermediate balance", outCount);
			for (let i=0; i<this.CLASS_COUNT; i++) {
				if (outCount[i] < minCount) {
					const outFilter = dataset.filter( ds => {
						return ds.out[i] == 1;
					});
					const limit = outFilter.filter( ds => ds.out.reduce( (a,b) => (a+b) == 1));
					console.log('out',i,'is emtpy, found ',outFilter.length, 'to add');
					if (limit.length > minCount) {
						// filter limits with only one tags
						filtered = filtered.concat(limit.slice(0, minCount));
					} else {
						filtered = filtered.concat(limit);
					}
				}
			}
			for (let i=0; i<this.CLASS_COUNT; i++) outCount[i]=0;
			filtered.forEach( ds => {
				// sum ouput
				ds.out.forEach( (val, index) => {
					if (val !== undefined) {
						outCount[index] += val;
					}
				});
			});
			console.log( "out balance", outCount);
			console.log('Count filtered / dataset -> '+ filtered.length + '/' + dataset.length);
			console.log('Minimum class => '+minCount);
			*/
			// Shuffle datas
			tf.util.shuffle(dataset);
			// split input / output
			let inputs = [];
			let masks = [];
			let outputs = [];
			let labels = [];
			dataset.forEach(d => {
				inputs = inputs.concat(d.in);
				masks = masks.concat(d.mask);
				outputs = outputs.concat(d.out);
				labels = d.labels;

			});
			// create tensor
			//let xs = tf.tensor3d(inputs, [filtered.length, 1, this.WINDOW_SIZE], 'float32');
			console.log("dataset length", dataset.length);
			let xs = tf.tensor3d(inputs, [ dataset.length, this.WINDOW_SIZE / this.TIMESTEPS, this.TIMESTEPS], 'float32');
			//let xs = tf.tensor3d(inputs, [dataset.length, this.WINDOW_SIZE, 1], 'float32');
			//let ys = tf.tensor2d(outputs, [filtered.length, this.CLASS_COUNT], 'int32');
			let yms = tf.tensor2d(masks, [ dataset.length, this.WINDOW_SIZE * this.CLASS_COUNT], 'int32');
			//Step 3. Normalize the data to the range 0 - 1 using min-max scaling
			const normalizedInputs = xs.sub(this.inputMin).div(this.inputMax - this.inputMin);
			// output is already normalized
			//const normalizedOutputs = ys.sub(this.outputMin).div(this.outputMax - this.outputMin);
			// Start model training process.
			function onEpochEnd(epoch, logs) {
				parentPort.postMessage('Epoch '+ epoch + '/300, accuracy ' + (Math.round(logs.acc * 1000) / 10) + '%, validation ' + (Math.round(logs.val_acc * 1000) / 10) + '%');
			}

			function onTrainBegin(logs) {
				parentPort.postMessage('Training begin ...');
			}
			async function train() {
			  await model.fit(normalizedInputs, yms, {
			    epochs: 300,
			    bachSize: 64,
			    shuffle: true,
			    validationSplit: 0.7,
			    // Add the tensorBoard callback here.
			    // parentPort.postMessage('Learning done !');
			    callbacks: {onEpochEnd, onTrainBegin}
			    //callbacks: tf.node.tensorBoard('/tmp/fit_logs_1')
			  });
			}
			async function save() {
				await model.save('file:///home/fcr/projects/node-enedis/datas/models/power-devices');
			}
			train().then( () => {
				save().then( () => {
					fs.writeFile("datas/models/power-devices/labels.json", JSON.stringify(labels), (err) => {
						console.log('Model saved with labels.');
						resolve();
					});
				});			
			});
		});
	}

	isLoaded() {
		return this.model !== null;
	}

	async load() {
		this.model = await tf.loadLayersModel('file:///home/fcr/projects/node-enedis/datas/models/power-devices/model.json');
		this.labels = JSON.parse(fs.readFileSync('datas/models/power-devices/labels.json', 'utf8'));
		this.CLASS_COUNT = this.labels.length;
		console.log('model loaded !');
	}

	predict(from, to)
	{
		return new Promise( (resolve, reject) => {
			let outputs = [];
			console.log('query from', from, 'to', to);
			this.store.findPowerByRange(from, to, '1m').then ( (points) => {
				// loop on points
				let inps = points.map( value => value.powerkva);
				let chunk = inps.slice(0, this.WINDOW_SIZE);
				let chunkCount = 0;
				while(chunk.length>0) {
					if (chunk.length < this.WINDOW_SIZE) {
						break;
						// while(chunk.length < this.WINDOW_SIZE) {
						// 	chunk.push(0);
						// }
					}
					//const xs = tf.tensor3d(chunk, [ 1, this.WINDOW_SIZE, 1]);
					const xs = tf.tensor3d(chunk, [ 1, this.WINDOW_SIZE / this.TIMESTEPS, this.TIMESTEPS]);
					const normalizedInputs = xs.sub(this.inputMin).div(this.inputMax - this.inputMin);
		    		const outps = this.model.predict(normalizedInputs);
		    		// const predicted = this.predictTag(Array.from(outps[0].dataSync()), Array.from(outps[1].dataSync()));
		    		const source = Array.from(outps.dataSync());
		    		const predicted = this.predictMask(source); //, Array.from(outps[1].dataSync()));
			   	    const results = predicted.map( p => {return {index: chunkCount, name: p.name, percent: p.percent, mask: p.mask};}); 	
			   		outputs = outputs.concat(results);
			   		// cut new chunk !
			   		chunkCount++;
			   		chunk = inps.slice(chunkCount * this.WINDOW_SIZE, chunkCount * this.WINDOW_SIZE +this.WINDOW_SIZE);
		   		}
		   	    console.log(outputs);
			    resolve(outputs);
			}).catch( (err) => {
				reject(err);
			});
		});
	}
}

module.exports = new MachineLearning();
