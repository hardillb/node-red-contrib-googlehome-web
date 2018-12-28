var mongoose = require('mongoose');
var AutoIncrement = require('mongoose-sequence');
var Schema = mongoose.Schema;

var State = new Schema({
	id: {type: Number, get: function(value){
		return value.toString();
	}},
	device: { type: Schema.Types.ObjectId, ref: 'Device' },
	state: {type: Schema.Types.Mixed}
});

module.exports = mongoose.model('State', State);
