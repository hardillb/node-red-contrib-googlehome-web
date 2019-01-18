var Devices = require('./models/device');
var States = require('./models/state');
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
		mqttClient.subscribe('status/#');
	});

	mqttClient.on('message',function(topic, message){
		logger.debug("MQTT message on ",topic, " - " , message.toString("utf8"), " ", topic.startsWith("response/"))
		if (topic.startsWith('response/')) {
			logger.debug("respose")
			var payload = JSON.parse(message);
			var waiting = inflightRequests[payload.requestId];
			logger.debug(inflightRequests)
			if (waiting) {
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
								states: payload.execution.params
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
				States.findOne({device: payload.id}, function(err, data){
					if (!err && data) {
						//update
						logger.debug("Existing status for device ", payload.id, " ", data);
						logger.debug("Updating status for device ", payload.id, " with ", payload.execution.params);
						data.state = Object.assign(data.state, payload.execution.params);
						data.updated = new Date();
						logger.debug("Updated status objejct for device ", payload.id, " to ", data);
						States.update({device: payload.id}, data, function(err, raw){
							if (!err) {
								logger.debug("Updated sucessfully");
							}
						});
					} else if (!err && !data) {
						//create
						logger.debug("creating status for device ", payload.id);
						var state = new State({
							device: payload.id,
							state: payload.execution.params
						});
						state.save(function(error){
							if (!error) {
								logger.debug("Saved state");
							} else {
								logger.debug("error saving state - ", error);
							}
						})
					} else {
						logger.debug("problem getting status entry - ", err);
					}
				})
			}
		} else  if (topic.startsWith('status/')) {
			//need to do very similar to above
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
					Devices.find({username: user},
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
							reportStateUser(user);
						} else {
							logger.info(error);
						}
					});
					break;
				case 'action.devices.QUERY':
					logger.debug("Query - ", request);
					var deviceList = [];
					for(var i in request.inputs[0].payload.devices) {
						deviceList.push(request.inputs[0].payload.devices[i].id);
					}
					logger.debug("Query dev list - ", deviceList);
					States.find({device: { $in: deviceList}},function(error,data){
						if (!error && data) {
							logger.debug("Query status data - ", data);
							var response = {
								requestId: requestId,
								payload: {
									devices: {}
								}
							};
							if (Array.isArray(data)) {
								logger.debug("Query response is array");
								for (var i in data) {
									response.payload.devices[data[i].device] = data[i].state;
								}
							} else {
								logger.debug("Query single result");
								response.payload.devices[data.device] = data.state;
							}
							logger.debug("Query response",response);
							res.send(response);
						} else {
							logger.debug("Query Problem with status, ", error)
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
					break;
				case 'action.devices.DISCONNECT':
					res.send({});
					break;
			}
		}
	);

	function reportStateUser(user) {
		logger.debug("reportStateUser");
		Devices.find({username: user},function(err, data){
			if (!err) {
				var devIds = [];
				if (Array.isArray(data)) {
					for (var i=0; i<data.length; i++) {
						devIds.push(parseInt(data[i].id))
					}
				} else {
					devIds.push(parseInts(data.id));
				}
				logger.debug("reportStateUser dev ids ", devIds);
				logger.debug("reportStateUser query ", {device: {$in: devIds}});
				States.find({device: { $in: devIds }}, function(err, states){
					if (err) {
						logger.debug("reportStateUser state error-  ", err);
					} else {
						var payload = {
							agentUserId: "",
							payload: {
								devices:{
									states:{}
								}
							}
						}
						for(var i=0; i<states.length; i++) {
							payload.payload.devices.states[states.device] = states.state;
						}
						logger.debug("reportStateUser states ", payload)
					}
				});
			} else {
				logger.debug("reportStateUser err ", err);
			}
		})
	}

	function reportStateDevice(user,device,requestId) {

	}

};
