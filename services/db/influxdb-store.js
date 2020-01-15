const Influx = require('influx');

class Store {
   constructor(opts) {
   	    this.influx = new Influx.InfluxDB({
		  host: opts.database.host,
		  port: opts.database.port,
		  database: opts.database.name,
		  schema: [
		    {
		      measurement: 'liny_datas',
		      fields: {
		        current: Influx.FieldType.INTEGER,
		        indexHeureCreuse: Influx.FieldType.INTEGER,
		        indexHeurePleine: Influx.FieldType.INTEGER,
		        currentMax: Influx.FieldType.INTEGER,
		        currentSubscribe: Influx.FieldType.INTEGER,
			power: Influx.FieldType.INTEGER
		      },
		      tags: [
		        'deliveryPoint',
		        'hourType'
		      ]
		    }
		  ]
		});
    	this.config = opts;
    	this.prixHeureCreuse = 0.1228;
    	this.prixHeurePleine = 0.1579;
   }

   connect() {
        return this.influx.getDatabaseNames()
		  .then(names => {
		    if (!names.includes(this.config.database.name)) {
		      return this.influx.createDatabase(this.config.database.name);
		    }
		});
   }

   close() {
   }

   addEvents(deliveryPoint, hourType, record) {
		return this.influx.writePoints([
	      {
	        measurement: 'liny_datas',
	        tags: { deliveryPoint: deliveryPoint, hourType: hourType },
	        fields: { 
		        current: record.current,
		        indexHeureCreuse: record.indexHeureCreuse,
		        indexHeurePleine: record.indexHeurePleine,
		        currentMax: record.currentMax,
		        currentSubscribe: record.currentSubscribe,
			power: record.power
	        },
	      }
	    ]).catch(err => {
	      console.error(`Error saving data to InfluxDB! ${err.stack}`)
	    });
   }

   findEvent(deliveryPoint,start, count) {
      return this.influx.query(`
	    select * from linky_datas
	    where deliveryPoint = ${Influx.escape.stringLit(deliberyPoint)}
	    order by time desc
	    limit ${count}
	  `);
   }

   findIndexByDate(date) {
      return this.influx.query(`select * from liny_datas 
      	where time >= '${date}'
	    order by time asc
      	limit 1
      `);
   }

   findIndexByRange(startDate, endDate, groupby= '1h') {
      return this.influx.query(`
	    select 
	    (max("indexHeureCreuse") - min("indexHeureCreuse")) AS "HeureCreuse", 
	    (max("indexHeurePleine") - min("indexHeurePleine")) AS "HeurePleine"
	    from liny_datas
	    where time >= ${Influx.escape.stringLit(startDate)}
	    and time <= ${Influx.escape.stringLit(endDate)}
	    group by time(${groupby})
	  `);
   }

   findPowerByRange(startDate, endDate, groupby= '30m') {
      return this.influx.query(`
	    select 
	    mean(power) AS "powerkva"
	    from liny_datas
	    where time >= ${Influx.escape.stringLit(startDate)}
	    and time <= ${Influx.escape.stringLit(endDate)}
	    group by time(${groupby})
	  `);
   }

   findTemperatureByRange(startDate, endDate, room, groupby= '30m') {
      return this.influx.query(`
	    select 
	    mean("Temperature") AS "temperature"
	    from "hassio"."autogen"."°C"
	    where time >= ${Influx.escape.stringLit(startDate)}
	    and time <= ${Influx.escape.stringLit(endDate)}
	    and "entity_id"='temperature_${room}_temperature'
	    group by time(${groupby})
	  `);
   }
}

module.exports = Store;
