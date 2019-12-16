/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/index.ts");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./src/app.ts":
/*!********************!*\
  !*** ./src/app.ts ***!
  \********************/
/*! exports provided: NodeRedApp */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"NodeRedApp\", function() { return NodeRedApp; });\n/// <reference types=\"@google/local-home-sdk\" />\nclass NodeRedApp {\n    constructor(app) {\n        this.app = app;\n        this.port = 1880;\n        this.path = \"/google-home/localControl/\";\n        this.proxyDeviceID = \"\";\n        this.identifyHandler = async (identifyRequest) => {\n            console.log(\"idenityHandler\", JSON.stringify(identifyRequest, null, 2));\n            const device = identifyRequest.inputs[0].payload.device;\n            //console.log(device);\n            if (device.mdnsScanData === undefined) {\n                throw Error(`indenty request is missing discovery response ${identifyRequest}`);\n            }\n            console.log(device.mdnsScanData);\n            this.path = device.mdnsScanData.txt.path;\n            this.port = parseInt(device.mdnsScanData.txt.port);\n            this.proxyDeviceID = device.mdnsScanData.txt.id;\n            return new Promise((resolve, reject) => {\n                const response = {\n                    intent: smarthome.Intents.IDENTIFY,\n                    requestId: identifyRequest.requestId,\n                    payload: {\n                        device: {\n                            id: this.proxyDeviceID,\n                            isProxy: true,\n                            isLocalOnly: true\n                        }\n                    }\n                };\n                console.log(\"identifyHAndler response\", JSON.stringify(response, null, 2));\n                resolve(response);\n            });\n        };\n        this.reachableDevicesHandler = async (reachableRequest) => {\n            // return new Promise((resolve, reject) => {\n            console.log(\"reachableDeviceHandler\", JSON.stringify(reachableRequest, null, 2));\n            const proxyDevice = reachableRequest.inputs[0].payload.device.id;\n            //this.proxyDeviceID = proxyDevice.id;\n            const lookUpDevices = new smarthome.DataFlow.HttpRequestData();\n            lookUpDevices.requestId = reachableRequest.requestId;\n            lookUpDevices.deviceId = this.proxyDeviceID;\n            lookUpDevices.path = this.path + this.proxyDeviceID + \"/identify\"; //\"/google-home/localControl/1234/identify\";\n            lookUpDevices.port = this.port;\n            lookUpDevices.isSecure = false;\n            lookUpDevices.method = smarthome.Constants.HttpOperation.GET;\n            return new Promise((resolve, reject) => {\n                this.app.getDeviceManager()\n                    .send(lookUpDevices)\n                    .then(result => {\n                    const httpResults = result;\n                    console.log(httpResults.httpResponse.body);\n                    const response = {\n                        intent: smarthome.Intents.REACHABLE_DEVICES,\n                        requestId: reachableRequest.requestId,\n                        payload: {\n                            devices: JSON.parse(httpResults.httpResponse.body),\n                        },\n                    };\n                    console.log(\"reachableDeviceHandler Results\", JSON.stringify(response, null, 2));\n                    resolve(response);\n                });\n            });\n        };\n        this.executeHandler = async (executeRequest) => {\n            console.log(\"executeHandler\", JSON.stringify(executeRequest, null, 2));\n            const command = executeRequest.inputs[0].payload.commands[0];\n            //const id = command.devices[0].id;\n            const execution = command.execution[0];\n            console.log(command);\n            const executeResponse = new smarthome.Execute.Response.Builder()\n                .setRequestId(executeRequest.requestId);\n            const result = command.devices.map((dev) => {\n                const msg = {\n                    id: dev.id,\n                    requestId: executeRequest.requestId,\n                    execution: execution,\n                    local: true\n                };\n                console.log(msg);\n                const executeHttpRequest = new smarthome.DataFlow.HttpRequestData();\n                executeHttpRequest.requestId = executeRequest.requestId;\n                executeHttpRequest.deviceId = dev.id; //this.proxyDeviceID;\n                executeHttpRequest.method = smarthome.Constants.HttpOperation.POST;\n                executeHttpRequest.port = this.port;\n                executeHttpRequest.isSecure = false;\n                executeHttpRequest.path = this.path + this.proxyDeviceID + \"/execute/\" + dev.id;\n                executeHttpRequest.data = JSON.stringify(msg);\n                executeHttpRequest.dataType = \"application/json\";\n                return this.app.getDeviceManager()\n                    .send(executeHttpRequest)\n                    .then((result) => {\n                    const httpResults = result;\n                    const state = JSON.parse(httpResults.httpResponse.body);\n                    executeResponse.setSuccessState(result.deviceId, state);\n                })\n                    .catch((err) => {\n                    err.errorCode = err.errorCode || smarthome.IntentFlow.ErrorCode.INVALID_REQUEST;\n                    executeResponse.setErrorState(dev.id, err.errorCode);\n                });\n            });\n            return Promise.all(result)\n                .then(() => executeResponse.build());\n            //   return new Promise((resolve, reject) => {\n            //     // console.log(\"Sending command to \" + this.proxyDeviceID + \" on port \" + this.port);\n            //     // console.log(\"and path \" + this.path + id + \"/execute\");\n            //     // console.log(JSON.stringify(execution));\n            //     const executeHttpRequest = new smarthome.DataFlow.HttpRequestData();\n            //     executeHttpRequest.requestId = executeRequest.requestId;\n            //     executeHttpRequest.deviceId = id;//this.proxyDeviceID;\n            //     executeHttpRequest.method = smarthome.Constants.HttpOperation.POST;\n            //     executeHttpRequest.port = this.port;\n            //     executeHttpRequest.isSecure = false;\n            //     executeHttpRequest.path = this.path  + id + \"/execute\";\n            //     executeHttpRequest.data = JSON.stringify(execution);\n            //     executeHttpRequest.dataType = \"application/json\";\n            //     this.app.getDeviceManager()\n            //       .send(executeHttpRequest)\n            //       .then( result => {\n            //         console.log(\"excuteHandler http response\");\n            //         const httpResults = result as smarthome.DataFlow.HttpResponseData;\n            //         if (httpResults.httpResponse.statusCode == 200) {\n            //           var status = JSON.parse(httpResults.httpResponse.body as string);\n            //           console.log(\"execute response - \" + status);\n            //           executeResponse.setSuccessState(id,status.state);\n            //         } else {\n            //           executeResponse.setErrorState(id,\"transientError\");\n            //         }\n            //         resolve(executeResponse.build());\n            //      })\n            // });\n        };\n        this.app = app;\n    }\n}\n\n\n//# sourceURL=webpack:///./src/app.ts?");

/***/ }),

/***/ "./src/index.ts":
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _app__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./app */ \"./src/app.ts\");\n/// <reference types=\"@google/local-home-sdk\" />\n\nconst smarthomeApp = new smarthome.App(\"1.0.0\");\nconst homeApp = new _app__WEBPACK_IMPORTED_MODULE_0__[\"NodeRedApp\"](smarthomeApp);\nsmarthomeApp\n    .onIdentify(homeApp.identifyHandler)\n    .onReachableDevices(homeApp.reachableDevicesHandler)\n    .onExecute(homeApp.executeHandler)\n    .listen()\n    .then(() => {\n    console.log(\"Up and Running\");\n})\n    .catch((e) => {\n    console.error(e);\n});\n\n\n//# sourceURL=webpack:///./src/index.ts?");

/***/ })

/******/ });