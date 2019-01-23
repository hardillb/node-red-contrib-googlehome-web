var mongoose = require('mongoose');
var Devices = require('./models/device');
var States = require('./models/state');

var mongo_url = (process.env.MONGO_URL || 'mongodb://localhost:27017/assistant');

mongoose.Promise = global.Promise;
var mongoose_options = {
	server: {
		auto_reconnect:true,
		autoReconnect: true,
		reconnectTries: Number.MAX_VALUE,
		reconnectInterval: 1000,
		socketOptions: {
			autoReconnect: true
		}
	}
};
var mongoose_connection = mongoose.connection;
mongoose.connect(mongo_url, mongoose_options);

States.find({}, function(err, data){
	if (!err && data) {
		console.log(data);
		console.log("--------------")
		data.forEach(function(d){
			console.log()
			Devices.findOne({id: d.device}, function(err, device){
				console.log("updating - ", d);
				if (!err && device) {
					console.log("pre - ",device);
					device.state = d.state;
					console.log("post - ", device);
					device.save(function(err){
						// if (!err) {
						// 	States.deleteOne({_id: d._id}, function(err){
						// 		if (err) {
						// 			console.log(err);
						// 		}
						// 	})
						// }
					});
				} else {
					console.log("err - ", err);
					console.log("device - ", device);
				}
			});
		});
		setTimeout(function(){
			mongoose.disconnect();
		}, 5000);
	} else {
		console.log(err);
	}
});
