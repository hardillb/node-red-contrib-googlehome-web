var Devices = require('./models/device');

module.exports = function(app, passport, logger) {
	app.get('/api/v1/devices',
		passport.authenticate('basic', {session: false}),
		function(req, res, next) {
			var user = req.user.username
			Devices.find({username: user},function(error, data){
				if(!error){
					var devices = [];
					for (var i=0; i< data.length; i++) {
						var dev = {};
						dev.name = data[i].name.name;
						dev.id = data[i].id;
						dev.type = data[i].type;
						dev.traits = data[i].traits;
						devices.push(dev);
					}
					res.send(devices);
				}
			});
		}
	);
}