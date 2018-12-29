var device = require('./models/device');
var state = require('./models/state');
var mqtt = require('mqtt');

module.exports = function(app, passport, mqttOptions, logger){

	var mqttClient = mqtt.connect(mqttOptions);

	mqttClient.on('error',function(err){
		logger.info(err);
	});

	mqttClient.on('reconnect', function(){

	});

	console.log("action-route");

	mqttClient.on('connect', function(){
		console.log("connected");
		mqttClient.subscribe('response/#');
	});

	mqttClient.on('message',function(topic, message){

	});

	var inflightRequests = {};

	var timeout = setTimeout(function() {

	}, 500);

	app.post('/action',
		function(req,res,next){
			logger.debug("action");
			logger.debug(req.headers);
			next()
		},
		passport.authenticate('bearer' { session: false }), 
		function(req,res, next){
			var request = req.body;
			logger.debug(request);
			var requestId = request.requestId;
			var intent = request.inputs[0].intent;
			logger.debug("user: ", req.user.username);
			var user = req.user.username;
			logger.debug(intent);

			var response = {};
			switch(intent) {
				case 'action.devices.SYNC':
					logger.info("Sync");
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
							logger.debug(response);
							res.send(response);
						} else {
							logger.info(error);
						}
					});
					break;
				case 'action.devices.QUERY':
					var deviceList = [];
					for(var i in request.inputs[0].payload.devices) {
						deviceList.push(request.inputs[0].payload.devices[i].id);
					}
					state.find({id: { $in: deviceList}},function(error,data){
						if (!error) {
							var response = {devices: {}};
							if (Array.isArray(data)) {
								for (var i in data) {
									response.devices[data[i].id] = data[i].status;
								}
							} else {
								response.devices[data.id] = data.status;
							}
						} else {
							logger.debug("Problem with status, ", error)
						}
					});
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
					var topic = "command/" +req.user.username;
					var message = JSON.stringify({foo: "bar"});
					try {
						mqttClient.publish(topic, message);
					} catch (err) {

					}
					break;
				case 'action.devices.DISCONNECT':
					res.send({});
					break;
			}
		}
	);

};
