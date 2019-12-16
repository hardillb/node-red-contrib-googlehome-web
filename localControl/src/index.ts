/// <reference types="@google/local-home-sdk" />

import {NodeRedApp} from "./app";

const smarthomeApp: smarthome.App = new smarthome.App("1.0.0");
const homeApp = new NodeRedApp(smarthomeApp);

smarthomeApp
  .onIdentify(homeApp.identifyHandler)
  .onReachableDevices(homeApp.reachableDevicesHandler)
  .onExecute(homeApp.executeHandler)
  .listen()
  .then(() => {
    console.log("Up and Running")
  })
  .catch((e: Error) => {
  	console.error(e);
  });