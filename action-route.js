var Accounts = require('./models/account');
var Devices = require('./models/device');
var OAuth = require('./models/oauth');
var request = require('request');
var mqtt = require('mqtt');
var path = require('path');
var jwt = require('jsonwebtoken');
var fs = require("fs");


module.exports = function(app, passport, mqttOptions, logger){

	var reportStateURL = (process.env.REPORT_URL || "https://homegraph.googleapis.com/v1/devices:reportStateAndNotification");

	var jwtFile = (process.env.JTW_FILE || "jwt/Node-RED-c27b500a47b4.json" )

	var jwtPath = path.join(__dirname, jwtFile);
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
			logger.debug("response");
			var payload = JSON.parse(message);
			var waiting = inflightRequests[payload.requestId];
			var deviceId = payload.id;
			if (waiting) {
				if(waiting.devices.indexOf(deviceId) != -1) {
					waiting.devices.splice(waiting.devices.indexOf(deviceId), 1);
				}

				if (payload.status == true || !payload.hasOwnProperty("status")) {
					logger.debug("success: " + payload.id)
					var command = {
						ids: [payload.id],
						status: "SUCCESS",
						states: payload.execution.params
					}
					switch (waiting.execution.command){
						case "action.devices.commands.SetFanSpeed":
							command.states.currentFanSpeedSetting = payload.execution.params.fanSpeed;
							delete command.states.fanSpeed;
							break;
						case "action.devices.commands.ColorAbsolute":
							if (command.states.color) {
								if (command.states.color.temperature){
									command.states.color.temperatureK = command.states.color.temperature;
									delete command.states.color.temperature;
								}
								if (command.states.color.name) {
									delete command.states.color.name;
								}
							}
							break;
						case "action.devices.commands.SetModes":
							command.states.currentModeSettings = command.states.updateModeSettings;
							delete command.states.updateModeSettings
							break;
						case "action.devices.commands.StartStop":

							if (command.states.start) {
								command.states.isRunning = true;
								command.states.isPaused = false;
								if (command.states.zone) {
									command.states.activeZones = [command.states.zone];
									delete command.states.zone;
								}

							} else {
								command.states.isRunning = false;
								command.states.isPaused = false;
							}
							delete command.states.start;
							break;
						case "action.devices.commands.PauseUnpause":
							if (command.states.pause) {
								command.states.isRunning = false;
								command.states.isPaused = true;
							} else {
								command.states.isRunning = true;
								command.states.isPaused = false;
							}
							delete command.states.pause;
							break;
						case "action.devices.commands.SetToggles":
							command.states.currentToggleSettings = command.states.updateToggleSettings;
							delete command.states.updateToggleSettings;
							break;
						case "action.devices.commands.Locate":
							command.states.generatedAlert = true;
							delete command.states.silent;
							delete command.states.lang;
							break;
					}

					inflightRequests[payload.requestId].commands.push(command)
				} else {
					logger.debug("Need to send a failure: " + payload.id);
					inflightRequests[payload.requestId].commands.push({
						ids: [payload.id],
						status: "ERROR"
					})
				}
				logger.debug("waiting.devices ", waiting.devices);
				if (waiting.devices.length == 0) {

					var response = {
						requestId: payload.requestId,
						payload:{
							commands: inflightRequests[payload.requestId].commands
						}
					}
				
					logger.debug("got all devices, sending response ", response);
					waiting.resp.send(response); // http response

					delete inflightRequests[payload.requestId];
				}

				if (payload.execution.params) {

					Devices.findOne({id: payload.id}, function(err, data){
						if (!err && data && payload.execution) {
							logger.debug("Existing status for device ", payload.id, " ", data);
							logger.debug("Updating status for device ", payload.id, " with ", payload.execution.params);

							if (data.state) {

								data.state = Object.assign(data.state, payload.execution.params);

								if (payload.execution.params.color && payload.execution.params.color.spectrumRGB) {
									data.state.spectrumRGB = data.state.color.spectrumRGB;
									delete data.state.color;
									delete data.state.temperatureK;
								} else if (payload.execution.params.color && payload.execution.params.color.temperatureK) {
									data.state.temperatureK = data.state.color.temperatureK;
									delete data.state.color;
									delete data.state.spectrumRGB;
								}

								if (!payload.execution.params.isRunning && !payload.execution.params.isPaused) {
									delete data.state.activeZones;
								}

							} else {
								data.state = payload.execution.params;
								if (data.state.color && data.state.color.spectrumRGB) {
									data.state.spectrumRGB = data.state.color.spectrumRGB;
									delete data.state.color;
								}
								if (data.state.color && data.state.color.temperatureK) {
									data.state.temperatureK = data.state.color.temperatureK;
									delete data.state.color;
								}

								if (data.state.cameraStreamAccessUrl) {
									delete data.state.cameraStreamAccessUrl;
								}

								if (data.state.cameraStreamReceiverAppId) {
									delete data.state.cameraStreamReceiverAppId;
								}

								if (data.state.cameraStreamAuthToken) {
									delete data.state.cameraStreamAuthToken;
								}
 							}
							Devices.update({id: payload.id}, data, function(err, raw){
								if (!err) {
									logger.debug("Updated sucessfully");
									reportStateDevice(waiting.user, payload.id, payload.requestId);
								}
							});
						} else  {
							if (err) {
								logger.debug("problem getting device to update status - ", err);
							} else {
								if (!payload.execution) {
									logger.debug("no device state in the response");
								} else {
									logger.debug("device not found - ", payload.id);
								}
							}
						}
					})
				}
			}
		} else  if (topic.startsWith('status/')) {
			//need to do very similar to above
			var payload = JSON.parse(message);
			if (payload.id && payload.execution && payload.execution.params) {
				Devices.findOne({id: payload.id},function (err, data){
					if (!err && data) {
						logger.debug("status update");
						logger.debug("Existing status for device ", payload.id, " ", data);
						logger.debug("Updating status for device ", payload.id, " with ", payload.execution.params);

						if (data.state){

							data.state = Object.assign(data.state, payload.execution.params);

							if (payload.execution.params.color && payload.execution.params.color.spectrumRGB) {
								data.state.spectrumRGB = data.state.color.spectrumRGB
								delete data.state.color
								delete data.state.temperatureK
							} else if (payload.execution.params.color && payload.execution.params.color.temperatureK) {
								delete data.state.color
								delete data.state.spectrumRGB
							}

							if (!payload.execution.params.isRunning && !payload.execution.params.isPaused) {
								delete data.state.activeZones;
							}

						} else {
							data.state = payload.execution.params;
							if (data.state.color && data.state.color.spectrumRGB) {
								data.state.spectrumRGB = data.state.color.spectrumRGB;
								delete data.state.color;
							}
							if (data.state.color && data.state.color.temperatureK) {
								data.state.temperatureK = data.state.color.temperatureK;
								delete data.state.color;
							}
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

	app.get('/inflight', function(req,res,next){
		res.send(inflightRequests);
	});

	var timeout = setInterval(function() {
		var now = Date.now();
		var keys = Object.keys(inflightRequests);
		for (var key in keys) {
			logger.debug("checking inflight")
			var waiting = inflightRequests[keys[key]];
			var diff = now - waiting.timestamp;
			if (diff > 3000) {
				logger.debug("inflight timed out " + waiting.requestId);

				
				waiting.commands.push({
					ids: waiting.devices,
					status: "ERROR",
					errorCode: "offline"
				})

				logger.debug("waiting.commands: ", keys[key]);

				var response = {
					requestId: keys[key],
					payload: {
						commands: waiting.commands
						// status: "ERROR",
						// errorCode: "  offline"
					}
				};

				waiting.resp.send(response);
				logger.debug("sending timeout response:");
				logger.debug(response);
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
					logger.debug("Sync");
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
									if (data[i].state && data[i].state.online) {
										response.payload.devices[data[i].id].status = "SUCCESS";
									} else {
										response.payload.devices[data[i].id].status = "OFFLINE";
									}
								}
							} else {
								logger.debug("Query single result");
								response.payload.devices[data.id] = data.state;
								if (data[i].state && data[i].state.online) {
									response.payload.devices[data[i].id].status = "SUCCESS";
								} else {
									response.payload.devices[data[i].id].status = "OFFLINE";
								}
							}
							logger.debug("Query response",response);
							res.send(response);
						} else {
							logger.debug("Query Problem with status, ", error)
						}
					})
					break;
				case 'action.devices.EXECUTE':
					logger.debug("Execute: " + user);
					//send MQTT message to control device
					var payload = request.inputs[0].payload;
					logger.debug(payload);
					var devices = payload.commands[0].devices;
					logger.debug("devices ", devices);
					var execution = payload.commands[0].execution[0];
					logger.debug(execution);
					var params = execution.params;
					params.online = true;

					var devIds = []

					for (var i=0; i<devices.length; i++) {
						devIds.push(devices[i].id)
					}

					inflightRequests[requestId] = {
						user:req.user,
						resp: res,
						devices: devIds,
						execution: execution,
						commands:[],
						timestamp: Date.now()
					};

					var topic = "command/" +req.user.username;
					logger.debug("topic - " + topic);
					for (var i=0; i<devices.length; i++) {

						var message = JSON.stringify({
							requestId: requestId,
							id: devices[i].id,
							execution: execution
						});
						
						logger.debug("message: " , message);
						try {
							mqttClient.publish(topic, message);
						} catch (err) {
							logger.debug("problem publishing");
						}

					}
					break;
				case 'action.devices.DISCONNECT':
					logger.info("Disconnecting user: " + req.user.username);
					//Need to remove access tokens here.
					OAuth.RefreshToken.deleteMany({user: req.user},function(err){});
					OAuth.AccessToken.deleteMany({user: req.user},function(err){});
					OAuth.GrantCode.deleteMany({user: req.user},function(err){});
					res.status(200).send({});
					break;
			}
		}
	);

	function reportStateUser(user, requestId) {
		logger.debug("reportStateUser for ", user.username);
		OAuth.AccessToken.findOne({user: user._id},function(err, accessToken){
			if (!err && accessToken){
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
						logger.debug("reportStateUser url ", reportStateURL)
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
								//logger.debug();
							}
						});
					}
				});
			}
		})
	}

	function reportStateDevice(user,device,requestId) {
		OAuth.AccessToken.findOne({user: user._id},function(err, accessToken){
			if (!err && accessToken){
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
						//logger.debug("reportStateUser url ", reportStateURL)
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
								//logger.debug();
							}
						});
					} else {
						logger.debug("not reporting state as disabled in the db")
					}
				})
			}
		});
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
