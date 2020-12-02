class Socket {

	constructor(io) {
		this.io = io;
		this.users = [];
	}

	initiliaze() {
		this.io.on( "connection", function( socket )
		{
			this.users.push(socket);
		    console.log( "A user connected" );
		});
	}

	sendTo(target, msg) {

	}

	register(event, callback) {

	}
}

module.exports = Socket;
