const SerialPort = require('serialport');
const Readline = require('@serialport/parser-readline');

class Linky {
   constructor(opts, store) {
     this.port = new SerialPort(opts.device, { baudRate: 1200, dataBits: 7, stopBits: 1, parity: 'even'  });
     this.linkyData = {};
     this.store = store;
     this.isNew = false;
     this.measure = [];
     this.measureStore = [];
   }

   initialize() {
     this.parser = this.port.pipe(new Readline({ delimiter: '\n' }));
     this.parser.on('data', (data) => this.onData(data));
   }

   onData(data) {
     const params = data.replace(/\r/g,'').split(' ');
     switch(params[0]) {
		case 'ADCO':
			     if (this.isNew) {
			     	this.isNew = false;
			     	this.store.addEvents(this.linkyData.addr, this.linkyData.tarifEnCours,
			     			{
						        current: this.linkyData.intensiteInstantanee,
						        indexHeureCreuse: this.linkyData.indexHeureCreuse,
						        indexHeurePleine: this.linkyData.indexHeurePleine,
						        currentMax: this.linkyData.intensiteMax,
						        currentSubscribe: this.linkyData.intensiteSouscrit
			     			}
			     		);
			     }
			     this.linkyData.addr = params[1];
			     break;
		case 'OPTARIF':
			     this.linkyData.tarifSouscrit = params[1];
			     break;
		case 'ISOUSC':
			     this.linkyData.intensiteSouscrit = params[1];
			     break;
		case 'PTEC':
			     this.linkyData.tarifEnCours = params[1];
			     break;
		case 'HCHC':
			     this.linkyData.indexHeureCreuse = params[1];
			     break;
		case 'HCHP':
			     this.linkyData.indexHeurePleine = params[1];
			     break;
		case 'IINST':
			     this.linkyData.intensiteInstantanee = params[1];
			     break;
		case 'IMAX':
			     this.linkyData.intensiteMax = params[1];
			     break;
		case 'HHPHC':
			     this.linkyData.heureCreuseHeurePleine = params[1];
			     break;
		case 'MOTDETAT':
			     this.linkyData.etatCompteur = params[1];
			     this.isNew = true;
			     break;
		default:
     }
   }

   getState() {
   	return this.linkyData;
   }
}

module.exports = Linky;
