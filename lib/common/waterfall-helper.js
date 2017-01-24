/*jshint camelcase: false */
/*jshint newcap: false */

'use strict';

var uuid = require('node-uuid');

var common = require('./index');
var token = require('./token');
var resourceGroup = require('./resourceGroup-client');

var cbHelper = function(transform, state, callback) {
  return function(err, results) {
    if (err) {
      callback(err);
    } else {
      if (transform) {
        transform(state, results);
      } else {
        state.results = results;
      }
      callback(null, state);
    }
  };
};

// Functions meant to be called as waterfall tasks.  Except for intializeState, all others
// should accept only (state, callback) as arguments, and return only (err, state).  Tasks
// should begin by checking state for any dependencies, and add results to state after
// successful completion.

exports.initializeState = function(log, params) {
  return function(callback) {
    log.debug('initializeState(): params=%j', params);
    var state = {
      'log': log,
      'params': params
    };
    callback(null, state);
  };
};

exports.getToken = function(state, callback) {
  var environmentName = state.params.azure.environment;
  var environment = common.getEnvironment(environmentName);
  var apiVersion = common.API_VERSION[environmentName].TOKEN;

  state.log.debug('getToken(): environment=%j, apiVersion=%j', environment, apiVersion);

  var transform = function(state, results) {
    state.token = results;
  };

  token.getToken(environment, state.params.azure, apiVersion, state.log, cbHelper(transform, state, callback));
};

exports.createResourceGroup = function(state, callback) {
  var resource_group_name = state.params.parameters.resource_group_name || state.params.parameters.resourceGroup;
  var location = state.params.parameters.location;
  var tags = common.mergeTags(state.params.parameters.tags);

  state.log.debug('createResourceGroup(): resource_group_name=%s, location=%s', resource_group_name, location);

  var rg_params = {
    'location': location,
    'tags': tags
  };

  resourceGroup.initialize(state.params.azure, state.log);
  resourceGroup.createOrUpdate(resource_group_name, rg_params, cbHelper(null, state, callback));
};

exports.checkExistenceOfResourceGroup = function(state, callback) {
  var resource_group_name = state.params.parameters.resource_group_name || state.params.parameters.resourceGroup;
  
  state.log.debug('checkExistenceOfResourceGroup(): resource_group_name=%s', resource_group_name);

  resourceGroup.checkExistence(resource_group_name, cbHelper(null, state, callback));
};

/* Functions meant to be called from within enveloping waterfall tasks */

exports.initializeRequestHeaders = function(state, message) {
  var clientRequestId = uuid.v4();
  
  state.log.info('%s: x-ms-client-request-id: %s', message, clientRequestId);

  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + state.token,
    'x-ms-client-request-id': clientRequestId,
    'x-ms-return-client-request-id': true
  };
};