var Application = require('./modess/oauth').Application;

var mqtt_user = (process.env.MQTT_USER || undefined);

module.exports = function(app,passport){
	
	app.get('/services',
		passport.authenticate('basic', {session: false}),
		function(req,res){
			if (req.user.username === mqtt_user) {
				Application.find({},function(error, data){
					if (!error) {
						res.send(data);
					}
				});
			} else {
				res.status(401).end();
			}
	});

	app.put('/service',
		passport.authenticate('basic', {session: false}),
		function(req,res){
			if (req.user.username === mqtt_user) {
				var application = Application(req.body);
				application.save(function(err, application){
					if (!err) {
						res.status(201).send(application);
					} else {
						res.status(500).send(error);
					}
				});
			} else {
				res.status(401).end();
			}
	});

	app.post('/service/:id',
		passport.authenticate('basic', {session: false}),
		function(req,res){
			if (req.user.username === mqtt_user) {
				var application = req.body;
				Application.findOne({_id: req.params.id}, function(error, data){
					if (err) {
						res.status(500).end();
					} else {
						data.tile = application.title;
						data.oauth_secret = application.oauth_secret;
						data.domains = application.domains;
						data.save(function(err, d){
							if (!err) {
								res.status(201).send(d)
							} else {
								res.status(500).send(err);
							}
						})
					}
				});
			} else {
				res.status(401).end();
			}
	});

	app.delete('/service/:id',
		passport.authenticate('basic', {session: false}),
		function(req,res){
			if (req.user.username === mqtt_user) {
				Application.remove({_id: req.params.id}, function(err){
					if (err) {
						res.status(500).send(err);
					} else {
						res.status(204).end();
					}
				});
			} else {
				res.status(401).end();
			}
	});

	// function ensureAuthenticated(req,res,next) {
	// 	if (req.isAuthenticated()) {
	//     	return next();
	// 	} else {
	// 		res.redirect('/login');
	// 	}
	// }
};