const MongoClient = require('mongodb').MongoClient;

class Store {
   constructor(config) {
      this.config = config;
      this.url = this.config.mongoUrl;
   }

   connect() {
        return new Promise( (resolve, reject) => {
            MongoClient.connect( this.url, {}).then( (client) => {
                    this.db = client;
                    resolve(client);
                    console.log('Connected to database');
            }).catch((err) => {
                    reject(err);
            });
        }); 
   }

   close() {
      if (this.db) {
         this.db.close();
      }
   }

   addEvents(objects) {
		return new Promise( (resolve, reject) => {
			if (this.db) {
		        const eventCollection = this.db.collection('events');
	            eventCollection.insertMany(objects, (err, result) => {
	             if(!err) {
	                console.log('events inserted');
	                resolve(result);
	                eventCollection.save();
	             } else {
	                    reject(err);
	                 }
	               });
	            } else {
	              reject('Not connected');
	            }
	    });
   }

   findEvent(expr,start, count) {
      return new Promise( (resolve, reject) => {
		    if (!this.db) {
		        reject('Not connected to database');
		    }
            const eventCollection = this.db.collection('events');
            eventCollection.find(expr).skip(start).limit(count).sort({timestamp: -1}).toArray().then((docs) => {
               resolve(docs);
            }).catch((err) => {
               reject(err);
            });
      });
   }

   getLastEvent() {
      return new Promise( (resolve, reject) => {
        if (!this.db) {
            reject('Not connected to database');
        }
        const eventCollection = this.db.collection('events');
        eventCollection.find({}).skip(0).limit(5).sort({timestamp: -1}).toArray().then((docs) => {
           resolve(docs);
        }).catch((err) => {
           reject(err);
        });
      });
   }

}

module.exports = Store;