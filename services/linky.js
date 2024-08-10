const { SerialPort, SerialPortMock } = require('serialport');
const Readline = require('@serialport/parser-readline');
const fs = require('fs');

class Linky {
   constructor(opts, store) {
	 if (fs.existsSync(opts.device)) {
		// Open the serial port
	    this.port = new SerialPort({ path: opts.device, baudRate: 1200, dataBits: 7, stopBits: 1, parity: 'even'});
	 } else {
		//If the serial port is not found, use a null device
		SerialPortMock.binding.createPort('/dev/dummy');
		this.port = new SerialPortMock({path: "/dev/dummy",baudRate: 1200, dataBits: 7, stopBits: 1, parity: 'even'});
	 }
     this.linkyData = {};
     this.store = store;
     this.isNew = false;
     this.measure = [];
     this.measureStore = [];
   }

   initialize() {
	if (!this.parser && this.port && Readline) { // Check if port and Readline are defined
	  this.parser = this.port.pipe(new Readline({ delimiter: '\n' }));
	  this.parser.on('data', (data) => this.onData(data));
	} else {
	  console.error("Dependencies not loaded yet");
	}
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
						        currentSubscribe: this.linkyData.intensiteSouscrit,
							power: this.linkyData.puissanceApparente
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
		case 'PAPP':
			     this.linkyData.puissanceApparente = params[1];
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
