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
		console.log("hmmm")
		console.log(data);
		for(var i=0; i<data.length; i++) {
			console.log("stuff");
			var d = data[i];
			Devices.findOne({id: data[i].device}, function(err, device){
				if (!err && device) {
					console.log(device);
					device.state = d.state;
					console.log(device);
					device.save(function(err){
						if (!err) {
							States.deleteOne({_id: d._id}, function(err){
								if (err) {
									console.log(err);
								}
							})
						}
					});
				}
			})
		}
		setTimeout(function(){
			mongoose.disconnect();
		}, 5000);
	} else {
		console.log(err);
	}
});
