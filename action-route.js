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
					switch (waiting.execution.command){
						case "action.devices.commands.SetFanSpeed":
							response.payload.commands[0].states.currentFanSpeedSetting = payload.execution.params.fanSpeed;
							delete response.payload.commands[0].states.fanSpeed;
							break;
						case "action.devices.commands.ColorAbsolute":
							if (response.payload.commands[0].states.color.spectrumRGB){
								response.payload.commands[0].states.color.spectrumRgb = response.payload.commands[0].states.color.spectrumRGB;
								delete response.payload.commands[0].states.color.spectrumRGB;
							}
							if (response.payload.commands[0].states.color.temperature) {
								response.payload.commands[0].states.color.temperatureK = response.payload.commands[0].states.color.temperature;
								delete response.payload.commands[0].states.color.temperature;
							}
							break;
						case "action.devices.commands.SetModes":
							response.payload.commands[0].states.currentModeSettings = response.payload.commands[0].states.updateModeSettings;
							delete response.payload.commands[0].states.updateModeSettings
							break;
						case "action.devices.commands.StartStop":

							if (payload.execution.params.start) {
								response.payload.commands[0].states.isRunning = true;
								response.payload.commands[0].states.isPaused = false;
								if (payload.execution.params.zone) {
									response.payload.commands[0].states.activeZones = [payload.execution.params.zone];
									delete payload.execution.params.zone;
								}
							} else {
								response.payload.commands[0].states.isRunning = false;
								response.payload.commands[0].states.isPaused = false;
							}
							delete payload.execution.params.start;
							break;
						case "action.devices.commands.PauseUnpause":
							if (payload.execution.params.pause) {
								response.payload.commands[0].states.isRunning = false;
								response.payload.commands[0].states.isPaused = true;
							} else {
								response.payload.commands[0].states.isRunning = true;
								response.payload.commands[0].states.isPaused = false;
							}
							delete payload.execution.params.pause;
							break;
						case "action.devices.commands.SetToggles":
							response.payload.commands[0].states.currentToggleSettings = response.payload.commands[0].states.updateToggleSettings;
							delete response.payload.commands[0].states.updateToggleSettings;
							break;
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
				waiting.resp.send(response); // http response
				Devices.findOne({id: payload.id}, function(err, data){
					if (!err) {
						logger.debug("Existing status for device ", payload.id, " ", data);
						logger.debug("Updating status for device ", payload.id, " with ", payload.execution.params);

						if (data.state) {

							data.state = Object.assign(data.state, payload.execution.params);

							if (payload.execution.params.color && payload.execution.params.color.spectrumRgb) {
								delete data.state.color.temperatureK
							} else if (payload.execution.params.color && payload.execution.params.color.temperatureK) {
								delete data.state.color.spectrumRgb
							}

							if (!payload.execution.params.isRunning && !payload.execution.params.isPaused) {
								delete data.state.activeZones;
							}

						} else {
							data.state = payload.execution.params;
						}
						Devices.update({id: payload.id}, data, function(err, raw){
							if (!err) {
								logger.debug("Updated sucessfully");
								reportStateDevice(waiting.user, payload.id, payload.requestId);
							}
						});
					} else  {
						logger.debug("problem getting device to update status - ", err);
					}
				})
			}
		} else  if (topic.startsWith('status/')) {
			//need to do very similar to above
			var payload = JSON.parse(message);
			if (payload.id) {
				Devices.findOne({id: payload.id},function (err, data){
					if (!err && data) {
						logger.debug("status update");
						logger.debug("Existing status for device ", payload.id, " ", data);
						logger.debug("Updating status for device ", payload.id, " with ", payload.execution.params);

						if (data.sate){
							data.state = Object.assign(data.state, payload.execution.params);

							if (payload.execution.params.color && payload.execution.params.color.spectrumRgb) {
								delete data.state.color.temperatureK
							} else if (payload.execution.params.color && payload.execution.params.color.temperatureK) {
								delete data.state.color.spectrumRgb
							}

							if (!payload.execution.params.isRunning && !payload.execution.params.isPaused) {
								delete data.state.activeZones;
							}

						} else {
							data.state = payload.execution.params;
						}
						Devices.update({id: payload.id}, data, function(err, raw){
							if (!err) {
								logger.debug("Updated sucessfully");
								Accounts.findOne({username: data.username}, function(err, user){
									reportStateDevice(user, payload.id);
								})
							}
						});
					} else {
						logger.debug("problem getting device to report status - ", err);
					}
				});
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
							reportStateUser(req.user, requestId);
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
						user:req.user,
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
					logging.debug("Disconnecting user" );
					res.send({});
					break;
			}
		}
	);

	function reportStateUser(user, requestId) {
		logger.debug("reportStateUser for ", user.username);
			Devices.find({username: user.username}, function(err, states){	
			if (err) {
				logger.debug("reportStateUser state error-  ", err);
			} else {
				//logger.debug("reportStateUser states ", states)
				var payload = {
					agentUserId: user._id,
					payload: {
						devices:{
							states:{}
						}
					}
				}
				if (requestId) {
					payload.requestId = requestId;
				}
				for(var i=0; i<states.length; i++) {
					if (states[i].willReportState) {
						payload.payload.devices.states[states[i].id] = states[i].state;
					}
				}
				logger.debug("reportStateUser states ", payload)
				request({
					url: reportStateURL,
					method: 'POST',
					headers:{
						'Content-Type': 'application/json',
						'Authorization': 'Bearer ' + oAuthToken,
						'X-GFE-SSL': 'yes'
					},
					json: payload
				},
				function(err, resp, body){
					if (err) {
						logger.debug("Problem reporting state - ", err, " - ", body);
					} else {
						logger.debug();
					}
				});
			}
		});
	}

	function reportStateDevice(user,device,requestId) {
		logger.debug("reportStateDevice - ", device);
		var payload = {
			agentUserId: user._id,
			payload: {
				devices: {
					states: {
					}
				}
			}
		}
		if (requestId) {
			payload.requestId = requestId
		} else {
			logger.debug("out of band update");
		}
		Devices.findOne({id: device}, function(err, state){
			payload.payload.devices.states[device] = state.state;
			logger.debug("reportStateDevice - ", payload);
			if (state.willReportState) {
				logger.debug("should report state HTTP")
				request({
					url: reportStateURL,
					method: 'POST',
					headers:{
						'Content-Type': 'application/json',
						'Authorization': 'Bearer ' + oAuthToken,
						'X-GFE-SSL': 'yes'
					},
					json: payload
				},
				function(err, resp, body){
					if (err) {
						logger.debug("Problem reporting state - ", err, " - ", body);
					} else {
						logger.debug();
					}
				});
			}
		})
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
