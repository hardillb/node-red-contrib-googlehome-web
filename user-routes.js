const LostPassword = require('./models/lostPassword')
const Account = require('./models/account');
const Topics = require('./models/topics');
const Devices = require('./models/device');
const States = require('./models/state');
const Oauth = require('./models/oauth');
const request = require('request');
const ObjectId = require('mongoose').Types.ObjectId;


const sendemail = require('./sendemail');
const mailer = new sendemail();

module.exports = function(app, passport, logger) {

	const API_KEY = (process.env.API_KEY);
	const SYNC_URL = (process.env.SYNC_URL || "https://homegraph.googleapis.com/v1/devices:requestSync?key=" + API_KEY);

	app.get('/login', function(req,res){
		res.render('pages/login',{user: req.user, message: req.flash('error')});
	});

	app.post('/login', 
		passport.authenticate('local', {failureRedirect: '/login',failureFlash: true, session: true }),
		function(req,res){
			if (req.query.next) {
				res.reconnect(req.query.next);
			} else {
				res.redirect('/user/devices');
			}
		}
	);

	app.get('/logout', function(req,res){
		req.logout();
		if (req.query.next) {
			console.log(req.query.next);
			res.redirect(req.query.next);
		} else {
			res.redirect('/');
		}
	});

	app.get('/register', function(req,res){
		res.render('pages/register',{user: req.user, message: req.flash('error')});
	});

	app.post('/register', function(req,res){
		Account.register(new Account({ username : req.body.username, email: req.body.email, mqttPass: "foo" }), req.body.password, function(err, account) {
			if(err) {
				logger.debug("error in account creation - ", err);
				res.status(500).send(err.message);
				return;
			} else {
				var topics = new Topics({topics: [
					'command/' + account.username +'/#', 
					'presence/'+ account.username + '/#',
					'response/' + account.username + '/#',
					'status/' + account.username + "/#"
				]});
				topics.save(function(err){
					if (!err) {
						var s = Buffer.from(account.salt, 'hex').toString('base64');
						var h = Buffer.from(account.hash, 'hex').toString(('base64'));

						var mqttPass = "PBKDF2$sha256$901$" + account.salt + "$" + account.hash;

						Account.update(
							{username: account.username}, 
							{$set: {mqttPass: mqttPass, topics: topics._id}}, 
							{ multi: false },
							function(err, count){
								if (err) {
									console.log(err);
								}
							}
						);
					} else {
						res.status(500).send(err.message);
					}
				});
			
				passport.authenticate('local')(req, res, function () {
					console.log("created new user %s", req.body.username);
					// measurement.send({
					// 	t:'event', 
					// 	ec:'System', 
					// 	ea: 'NewUser',
					// 	uid: req.body.username
					// });
		      res.status(201).send();
	      });
			}
		});
	});

	app.get('/user/verifyEmail', function(req,res){
	})

	app.get('/user/lostPassword', function(req, res){
		res.render('pages/lostPassword', { user: req.user});
	})

	app.post('/user/lostPassword', function(req, res, next){
		var email = req.body.email;
		Account.findOne({email: email}, function(error, user){
			if (!error){
				if (user){
					var lostPassword = new LostPassword({user: user});
					lostPassword.save(function(err){
						if (!err) {
							res.status(200).send();
						}
						var body = mailer.buildLostPasswordBody(lostPassword.uuid, lostPassword.user.username);
						mailer.send(email, 'google-home@hardill.me.uk', 'Password Reset for Google Home Node-RED', body.text, body.html);
					});
				} else {
					res.status(404).send("No user found with that email address");
				}
			}
		});
	});


	app.get('/user/changePassword/:key', function(req, res){
		var uuid = req.params.key;
		LostPassword.findOne({uuid: uuid}).populate('user').exec(function(error, lostPassword){
			if (!error && lostPassword) {
				req.login(lostPassword.user, function(err){
					if (!err){
						lostPassword.remove();
						res.redirect('/user/changePassword');
					} else {
						console.log(err);
						res.redirect('/');
					}
				})
			} else {
				res.redirect('/');
			}
		});
	});

	app.get('/user/changePassword',
		ensureAuthenticated,
		function(req,res){
			res.render('pages/changePassword', {user: req.user});
		});

	app.post('/user/changePassword', 
		ensureAuthenticated,
		function(req, res){
			Account.findOne({username: req.user.username}, function (err, user){
				if (!err && user) {
					user.setPassword(req.body.password, function(e,u){
						// var s = Buffer.from(account.salt, 'hex').toString('base64');
						// var h = Buffer.from(account.hash, 'hex').toString(('base64'));
						var mqttPass = "PBKDF2$sha256$901$" + user.salt + "$" + user.hash;
						u.mqttPass = mqttPass;
						u.save(function(error){
							if (!error) {
								//console.log("Chagned %s's password", u.username);
								res.status(200).send();
							} else {
								logger.info("Error changing ", u.username, "'s password");
								logger.debug(error);
								res.status(400).send("Problem setting new password");
							}
						});
					});
				} else {
					console.log(err);
					res.status(400).send("Problem setting new password");
				}
			});
	})

	app.get('/user/api/devices',
		passport.authenticate(['basic'], { session: false }),
		function (req,res){
			var user = req.user.username;

			Devices.find({username:user}, function(err, data){
				if (!err) {
					logger.debug(data);
					res.send(data);
				} else {
					res.status(500);
					res.send();
				}
			});
		});


	app.get('/user/devices', 
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;

			Devices.find({username:user}, function(err, data){
				if (!err) {
					logger.debug(data);
					res.render('pages/devices',{user: req.user, devices: data, devs: true});
				}
			});
		}
	);

	app.put('/user/devices',
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;
			var device = req.body;

			device.username = user;
			var dev = new Devices(device);
			dev.save(function(err,data){
				if(!err) {
					res.status(201);
					res.send(data);
					triggerSync(req.user._id);
				} else {
					res.status(500);
					res.send(err);
				}
			});
		}
	);

	app.post('/user/devices/:dev_id',
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;
			var id = req.params.dev_id;
			var device = req.body;
			if (user === device.username) {
				Devices.findOne({_id: id, username: user},
					function( err, data) {
						if (err) {
							logger.debug(err);
							res.status(500);
							res.send(err);
						} else {
							data.type = device.type;
							data.traits = device.traits;
							data.attributes = device.attributes;
							data.roomHint = device.roomHint;
							if (device.willReportState) {
								data.willReportState = device.willReportState;
							}
							if (device.state) {
								data.state = Object.assign(device.state, data.state);
							}
							data.name = device.name;
							if (device.otherDeviceIds) {
								data.otherDeviceIds = device.otherDeviceIds;
							}
							data.save(function(err, d) {
								res.status(201);
								res.send(d);
								logger.debug("Sucessfully updated device ", d.id, " ", d);
								triggerSync(req.user._id);
							});
						}
					}
				)
			}
		}
	);

	app.delete('/user/devices/:dev_id',
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;
			var id = req.params.dev_id;
			Devices.findOne({_id: id, username: user},
				function(err, data) {
					if (!err) {
						logger.debug("found device to be deleted ", id);
						var devId = data.id;
						Devices.remove({_id: id, username: user}, function(err2){
							logger.debug("removing device");
							if (err2) {
								logger.debug("Problem deleting device ", id);
								logger.debug(err2);
								res.status(500);
								res.send(err);
							} else {
								States.remove({device: devId}, function(err3){
									if (err3) {
										logger.debug("problem deleting state for device ", devId);
									} else {
										logger.debug("Deleted state for device ", devId);
									}
								});
								triggerSync(req.user._id);
								res.status(202);
								res.send();
							}
						});
						
					} else {
						logger.debug("Problem deleting device ", id);
						logger.debug(err);
						res.status(500);
						res.send(err);
					}
				}
			);
		}
	);

	app.get('/user/expert-mode/:dev_id',
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;
			var id = req.params.dev_id;

			Devices.findOne({_id: id, username:user}, {_id:0, __v:0, username:0}, function(err, data){
				if (!err) {
					logger.debug(data);
					res.render('pages/expert-mode',{user: req.user, device: data, devs: true, id: id});
				}
			});
		}
	)

	app.get('/user/expert-mode',
		ensureAuthenticated,
		function(req,res) {
			var user = req.user.username;

			var data = {
				type: "action.devices.types.",
				name:{
					name: "",
					nicknames: []
				},
				roomHint: "",
				traits: [
				  "action.devices.traits.OnOff"
				],
				attributes: {
				},
				state: {
					online: true,
					on: true
				},
				willReportState: true,
				deviceInfo: {
					swVersion: "1.0",
					hwVersion: "1.0",
					model: "virtual",
					manufacturer: "Node-RED"
				},
				customData: {}
			}

			res.render('pages/expert-mode',{user: req.user, device: data, devs: true, id: -1});
		}
	)

	function ensureAuthenticated(req,res,next) {
		if (req.isAuthenticated()) {
	    	return next();
		} else {
			res.redirect('/login');
		}
	}

	function triggerSync(userAgentId) {
		// make HTTP call
		//need to check if currently live
		Oauth.AccessToken.find({user: new ObjectId(userAgentId)},function(err, data){
			if (!err && data.length > 0) {
				logger.debug("requesting sync with", {agentUserId: userAgentId});
				request(
					{
						url: SYNC_URL,
						method: "POST",
						json: {
							agentUserId: userAgentId
						}
					},
					function(err, resp, body) {
						if (!err) {
							logger.debug("trigger sync for ", userAgentId, " ",  resp && resp.statusCode)
							logger.debug("sync response body ", body)
						} else {
							logger.debug("error triggering sync for ", userAgentId, " ", err);
						}
					}
				);
			}
		});
	}

}