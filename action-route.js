var Accounts = require('./models/account');
var Devices = require('./models/device');
var request = require('request');
//var States = require('./models/state');
var mqtt = require('mqtt');
var path = require('path');
var jwt = require('jsonwebtoken');
var fs = require("fs");


module.exports = function(app, passport, mqttOptions, logger){

	var reportStateURL = (process.env.REPORT_URL || "https://homegraph.googleapis.com/v1/devices:reportStateAndNotification");

	var jwtPath = path.join(__dirname,"jwt/Node-RED-c27b500a47b4.json");
	var file = fs.readFileSync(jwtPath);
	var secrets = JSON.parse(file);
	var oAuthToken = null;

	var oAuthRefrestInterval = setInterval(getOAuthToken, 3500000);
	getOAuthToken();

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
				Devices.findOne({id: payload.id}, function(err, data){
					if (!err) {
						logger.debug("Existing status for device ", payload.id, " ", data);
						logger.debug("Updating status for device ", payload.id, " with ", payload.execution.params);
						if (data.state) {
							data.state = Object.assign(data.state, payload.execution.params);
						} else {
							data.state = payload.execution.params;
						}
						Devices.update({id: payload.id}, data, function(err, raw){
							if (!err) {
								logger.debug("Updated sucessfully");
								reportStateUser(waiting.username, waiting.user);
							}
						});
					} else  {
						logger.debug("problem getting device to update status - ", err);
					}
				})
				// States.findOne({device: payload.id}, function(err, data){
				// 	if (!err && data) {
				// 		//update
				// 		logger.debug("Existing status for device ", payload.id, " ", data);
				// 		logger.debug("Updating status for device ", payload.id, " with ", payload.execution.params);
				// 		data.state = Object.assign(data.state, payload.execution.params);
				// 		data.updated = new Date();
				// 		logger.debug("Updated status objejct for device ", payload.id, " to ", data);
				// 		States.update({device: payload.id}, data, function(err, raw){
				// 			if (!err) {
				// 				logger.debug("Updated sucessfully");
				// 				reportStateUser(waiting.username, waiting.user);
				// 			}
				// 		});
				// 	} else if (!err && !data) {
				// 		//create
				// 		logger.debug("creating status for device ", payload.id);
				// 		var state = new States({
				// 			device: payload.id,
				// 			state: payload.execution.params
				// 		});
				// 		state.save(function(error){
				// 			if (!error) {
				// 				logger.debug("Saved state");
				// 			} else {
				// 				logger.debug("error saving state - ", error);
				// 			}
				// 		})
				// 	} else {
				// 		logger.debug("problem getting status entry - ", err);
				// 	}
				// })
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
						{"_id": 0, "__v": 0, username: 0, state: 0 },
						function(error, data){
						if(!error) {
							response = {
								requestId: requestId,
								payload: {
									agentUserId: req.user._id,
									devices: data
								}
							};
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
					Devices.find({id: { $in: deviceList}}, {id: true, state: true}, function(error,data){
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
									response.payload.devices[data[i].id] = data[i].state;
								}
							} else {
								logger.debug("Query single result");
								response.payload.devices[data.id] = data.state;
							}
							logger.debug("Query response",response);
							res.send(response);
						} else {
							logger.debug("Query Problem with status, ", error)
						}
					})
					// States.find({device: { $in: deviceList}},function(error,data){
					// 	if (!error && data) {
					// 		logger.debug("Query status data - ", data);
					// 		var response = {
					// 			requestId: requestId,
					// 			payload: {
					// 				devices: {}
					// 			}
					// 		};
					// 		if (Array.isArray(data)) {
					// 			logger.debug("Query response is array");
					// 			for (var i in data) {
					// 				response.payload.devices[data[i].device] = data[i].state;
					// 			}
					// 		} else {
					// 			logger.debug("Query single result");
					// 			response.payload.devices[data.device] = data.state;
					// 		}
					// 		logger.debug("Query response",response);
					// 		res.send(response);
					// 	} else {
					// 		logger.debug("Query Problem with status, ", error)
					// 	}
					// });
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
						user:req.user._id,
						username: user,
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

	function reportStateUser(user, id) {
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
				Devices.find({id: { $in: devIds }}, function(err, states){
					if (err) {
						logger.debug("reportStateUser state error-  ", err);
					} else {
						logger.debug("reportStateUser states ", states)
						var payload = {
							agentUserId: id,
							payload: {
								devices:{
									states:{}
								}
							}
						}
						for(var i=0; i<states.length; i++) {
							payload.payload.devices.states[states[i].id] = states[i].state;
						}
						logger.debug("reportStateUser states ", payload)
						// request({
						// 	url: reportStateURL,
						// 	method: 'POST',
						// 	headers:{
						// 		'Content-Type': 'application/json',
						// 		'Authorization': 'Bearer ' + oAuthToken,
						// 		'X-GFE-SSL': 'yes'
						// 	},
						// 	json: payload
						// },
						// function(err, resp, body){
						// 	console.log(err);
						// 	console.log(body);
						// });
					}
				});
			} else {
				logger.debug("reportStateUser err ", err);
			}
		})
	}

	function reportStateDevice(user,device,requestId) {
	}

	function getOAuthToken() {
		var tokenPayload = {
			iat: new Date().getTime()/1000,
			exp: new Date().getTime()/1000 + 3600,
			aud: "https://accounts.google.com/o/oauth2/token",
			iss: secrets.client_email,
			scope: "https://www.googleapis.com/auth/homegraph"
		}

		var cert = secrets.private_key;

		var token = jwt.sign(tokenPayload, cert, { algorithm: 'RS256'});

		request.post({
			url: 'https://accounts.google.com/o/oauth2/token',
			form: {
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
				assertion: token
				}
			},
			function(err,httpResp,body){
				if (err) {
					logger.info("Problem getting oAuthToken for status push");
					oAuthToken = null;
				} else {
					var jsonBody = JSON.parse(body)
					oAuthToken = jsonBody.access_token;
					logger.info("Got new oAuthToken for status push");
				}
			}
		);
	}

};
