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

	mqttClient.on('connect', function(){
		console.log("connected");
		mqttClient.subscribe('response/#');
	});

	mqttClient.on('message',function(topic, message){
		logger.debug("MQTT message on ",topic, " - " , message.toString("utf8"), " ", topic.startsWith("response/"))
		if (topic.startsWith('response/')) {
			logger.debug("respose")
			var payload = JSON.parse(message);
			var waiting = inflightRequests[payload.requestId];
			if (waiting) {
				console.log("found waiting");
				delete inflightRequests[payload.requestId];
				var response = {
					requestId: payload.requestId
				};
				if (payload.status == true) {
					logger.debug("sucess")
					response.payload = {
						commands: [
							{
								ids: [payload.id],
								status: "SUCCESS",
								state: payload.params
							}
						]
					}
				} else {
					logger.debug("Need to send a failure");
					//need more here
					response.payload = {
						commands: [
							{
								ids: [payload.id],
								status: "ERROR"
							}
						]
					}
				}
				logger.debug("response ", response);
				waiting.resp.send(response);
			}
		}
	});

	var inflightRequests = {};

	var timeout = setInterval(function() {
		var now = Date.now();
		var keys = Object.keys(inflightRequests);
		for (var key in keys) {
			logger.debug("checking inflight")
			var waiting = inflightRequests[keys[key]];
			var diff = now - waiting.timestamp;
			if (diff > 3000) {
				logger.debug("inflight timed out - ", waiting);
				var response = {
					requestId: waiting.requestId,
					payload: {
						errorCode: "timeout"
					}
				}
				waiting.resp.send(response);
				delete(inflightRequests[keys[key]])
			}
		}
	}, 500);

	app.post('/action',
		passport.authenticate('bearer', { session: false }), 
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
					logger.debug("Query");
					var deviceList = [];
					for(var i in request.inputs[0].payload.devices) {
						deviceList.push(request.inputs[0].payload.devices[i].id);
					}
					state.find({id: { $in: deviceList}},function(error,data){
						if (!error) {
							var response = {
								requestId: requestId,
								payload: {
									devices: {}
								}
							};
							if (Array.isArray(data)) {
								for (var i in data) {
									response.payload.devices[data[i].id] = data[i].status;
								}
							} else {
								response.payload.devices[data.id] = data.status;
							}

							res.send(response);
						} else {
							logger.debug("Problem with status, ", error)
						}
					});
					break;
				case 'action.devices.EXECUTE':
					logger.debug("Execute");
					//send MQTT message to control device
					var payload = request.inputs[0].payload;
					logger.debug(payload);
					var devices = payload.commands[0].devices;
					logger.debug(devices);
					var execution = payload.commands[0].execution[0];
					logger.debug(execution);
					var params = execution.params;
					params.online = true;
					inflightRequests[requestId] = {
						resp: res,
						devices: devices,
						execution: execution,
						timestamp: Date.now()
					};
					var topic = "command/" +req.user.username;
					var message = JSON.stringify({
						requestId: requestId,
						id: devices[0].id,
						execution: execution
					});
					logger.debug(message);
					try {
						mqttClient.publish(topic, message);
					} catch (err) {
						logger.debug(err);
					}
					// res.send({
					// 	requestId: requestId,
					// 	payload: {
					// 		commands: [{
					// 			ids: [devices[0].id],
					// 			status: "SUCCESS",
					// 			state: params
					// 		}]
					// 	}
					// });
					break;
				case 'action.devices.DISCONNECT':
					res.send({});
					break;
			}
		}
	);

};
