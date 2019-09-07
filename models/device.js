var mongoose = require('mongoose');
var AutoIncrement = require('mongoose-sequence');
var Schema = mongoose.Schema;

//{
//       "id": "123",
//       "type": "action.devices.types.OUTLET",
//       "traits": [
//         "action.devices.traits.OnOff"
//       ],
//       "name": {
//         "defaultNames": ["My Outlet 1234"],
//         "name": "Night light",
//         "nicknames": ["wall plug"]
//       },
//       "roomHint": "",
//       "willReportState": true,
//       "deviceInfo": {
//         "manufacturer": "lights-out-inc",
//         "model": "hs1234",
//         "hwVersion": "3.2",
//         "swVersion": "11.4"
//       },
//       "customData": {
//         "fooValue": 74,
//         "barValue": true,
//         "bazValue": "foo"
//       }
//     }

var Device = new Schema({
	username: String,
	id: {type: Number, get: function(value){
		return value.toString();
	}},
	name: {
		name: String,
		nicknames: [String]
	},	
	type: String,
	roomHint: String,
	traits: [String],
	willReportState: { type: Boolean, default: true},
	deviceInfo: {
		manufacturer: {type: String, default: "Node-RED"},
		model: {type: String, default: "virtual" },
		hwVersion: {type: String, default: "1.0"},
		swVersion: {type: String, default: "1.0"}
	},
	attributes: Schema.Types.Mixed,
	customData: Schema.Types.Mixed,
	state: Schema.Types.Mixed,
	otherDeviceIds: {type: [
			{type: Schema.Types.Mixed}
		],
		default: undefined
	}

});

Device.plugin(AutoIncrement, {inc_field: 'id'});

Device.set('toObject', {getters: true});
Device.set('toJSON', {getters: true});

module.exports = mongoose.model('Device', Device);


// {
//   "requestId": "ff36a3cc-ec34-11e6-b1a0-64510650abcf",
//   "payload": {
//     "agentUserId": "1836.15267389",
//     "devices": [{
//       "id": "123",
//       "type": "action.devices.types.OUTLET",
//       "traits": [
//         "action.devices.traits.OnOff"
//       ],
//       "name": {
//         "defaultNames": ["My Outlet 1234"],
//         "name": "Night light",
//         "nicknames": ["wall plug"]
//       },
//       "willReportState": true,
//         "deviceInfo": {
//           "manufacturer": "lights-out-inc",
//           "model": "hs1234",
//           "hwVersion": "3.2",
//           "swVersion": "11.4"
//         },
//         "customData": {
//           "fooValue": 74,
//           "barValue": true,
//           "bazValue": "foo"
//         }
//     },{  
//       "id": "456",  
//       "type": "action.devices.types.LIGHT",
//         "traits": [
//           "action.devices.traits.OnOff", "action.devices.traits.Brightness", 
//           "action.devices.traits.ColorTemperature", 
//           "action.devices.traits.ColorSpectrum"  
//         ],  
//         "name": {  
//           "defaultNames": ["lights out inc. bulb A19 color hyperglow"],
//           "name": "lamp1",
//           "nicknames": ["reading lamp"]
//         },
//         "willReportState": true,
//         "attributes": {  
//           "temperatureMinK": 2000,  
//           "temperatureMaxK": 6500  
//         },  
//         "deviceInfo": {
//           "manufacturer": "lights out inc.",
//           "model": "hg11",  
//           "hwVersion": "1.2",  
//           "swVersion": "5.4"  
//         },  
//         "customData": {
//           "fooValue": 12,
//           "barValue": false,  
//           "bazValue": "bar"
//         }
//       }]  
//   }  
// }