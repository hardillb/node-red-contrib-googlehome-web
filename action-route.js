var device = require('./models/device');
var mqtt = require('mqtt');

module.exports = function(app, passport, mqttOptions) {

	var inflightRequests = {};

	app.post('/action',
		//passport.authenticate('bearer', { session: false }), 
		function(req,res){
			var request = req.body;
			console.log(request);
			var requestId = request.requestId;
			var intent = request.inputs[0].intent;
			console.log("user: %j", req.user.username);
			var user = req.user.username;
			console.log(intent);

			var response = {};
			switch(intent) {
				case 'action.devices.SYNC':
					console.log("Sync");
					device.find({username: user},
						{"_id": 0, "__v": 0, username: 0 },
						function(error, data){
						//console.log("HMM");
						if(!error) {
							//console.log("Ben");
							response = {
								requestId: requestId,
								payload: {
									agentUserId: req.user._id,
									devices: data
								}
							};
							//console.log("%j",response);
							res.send(response);
						} else {
							console.log(error);
						}
					});
					break;
				case 'action.devices.QUERY':
					break;
				case 'action.devices.EXECUTE':
					//send MQTT message to control device
					var payload = request.inputs[0].payload;
					var devices = payload.commands[0];
					var execution = payload.execution[0];
					inflightRequests[requestId] = {
						devices: devices,
						execution: execution
					};
					break;
			}

			
		}
	);

};
