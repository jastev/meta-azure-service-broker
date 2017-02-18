/*jshint camelcase: false */
/*jshint newcap: false */

'use strict';

var util = require('util');
var request = require('request');
var async = require('async');

var common = require('../../common');
var helper = require('../../common/helpers');

var restHelper = function(name, httpMethod, urlFactory, jsonFactory) {
  var label = 'ApiManagement - ' + name;
  return function(state, callback) {
    state.log.debug(label);
    var headers = helper.initializeRequestHeaders(state, label);
    headers['If-Match'] = '*';
    var req = {
      'url': urlFactory(state),
      'qs': { 'api-version' : state.apimgmt.azure.armApiVersion },
      'method': httpMethod,
      'headers': headers,
    };
    if (jsonFactory) req.json = jsonFactory(state);
    request(
      req,
      function(err, response, body) {
        common.logHttpResponse(state.log, response, label, true);
        return callback(err, state, response, body);
    });
  };
};

exports.httpStatus2XXCheck = function(state, response, body, callback) {
  var err;
  state.log.debug('ApiManagement - httpStatus2XXCheck - response: %j, body: %j', response, body);
  if (!response.statusCode.toString().startsWith('2')) {
    err = new Error(body && body.message ? body.message : 'Non-successful HTTP status:  ' + response.statusCode);
  }
  state.result = body;
  return callback(err, state);
};

// Services

var getServiceUrl = function(state) {
  return util.format(
    '%s/subscriptions/%s/providers/Microsoft.ApiManagement',
    state.apimgmt.azure.endpoint,
    state.apimgmt.azure.subscriptionId
  );
};

var getCheckNameAvailabilityUrl = function(state) {
  return getServiceUrl(state) + '/checkNameAvailability';
};

exports.checkInstanceNameAvailability = restHelper('checkInstanceNameAvailability', 'POST', getCheckNameAvailabilityUrl, function(state) { return { 'name': state.apimgmt.instance.name }; });

// Instances

 var getInstanceUrl = function(state) {
  return util.format(
    '%s/subscriptions/%s/resourceGroups/%s/providers/Microsoft.ApiManagement/service/%s',
    state.apimgmt.azure.endpoint,
    state.apimgmt.azure.subscriptionId,
    state.apimgmt.azure.resourceGroup,
    state.apimgmt.instance.name
  );
};

exports.getInstance = restHelper('getInstance', 'GET', getInstanceUrl);
exports.createOrUpdateInstance = restHelper('createOrUpdateInstance', 'PUT', getInstanceUrl, function(state) { return state.apimgmt.instance; });
exports.deleteInstance = restHelper('deleteInstance', 'DELETE', getInstanceUrl);

// Products

var getProductUrl = function(state) {
  return util.format('%s/%s', getInstanceUrl(state), state.apimgmt.product.id);
};

exports.getProduct = restHelper('getProduct', 'GET', getProductUrl);
exports.createOrUpdateProduct = restHelper('createOrUpdateProduct', 'PUT', getProductUrl, function(state) { return state.apimgmt.product; });
exports.updateProduct = restHelper('updateProduct', 'PATCH', getProductUrl, function(state) { return state.apimgmt.product; });
exports.deleteProduct = restHelper('deleteProduct', 'DELETE', getProductUrl);

// Product-APIs

var getProductApiUrl = function(state) {
  return util.format('%s/%s', getProductUrl(state), state.apimgmt.api.id);
};

exports.addApiToProduct = restHelper('addApiToProduct', 'PUT', getProductApiUrl);
exports.removeApiFromProduct = restHelper('removeApiFromProduct', 'DELETE', getProductApiUrl);

// APIs

var getApiUrl = function(state) {
  return util.format('%s/%s', getInstanceUrl(state), state.apimgmt.api.id);
};

exports.getApi = restHelper('getApi', 'GET', getApiUrl);
exports.createOrUpdateApi = restHelper('createOrUpdateApi', 'PUT', getApiUrl, function(state) { return state.apimgmt.api; });
exports.deleteApi = restHelper('deleteApi', 'DELETE', getApiUrl);

// API Operations

var getApiOperationUrl = function(key) {
  return function(state) {
    return util.format('%s/%s', getInstanceUrl(state), state.apimgmt.operations[key].id);
  };
};

var getApiOperationJson = function(key) {
  return function(state) {
    return state.apimgmt.operations[key];
  };
};

var createOrUpdateApiOperation = function(key) {
  return restHelper('createOrUpdateApiOperation', 'PUT', getApiOperationUrl(key), getApiOperationJson(key));
};

exports.createOrUpdateApiOperations = function(state, callback) {
  var tasks = [ function(callback) { return callback(null, state); } ];
  for (var i = 0; i < state.apimgmt.operations.length; i++) {
    tasks.push(createOrUpdateApiOperation(i));
    tasks.push(exports.httpStatus2XXCheck);
  }
  async.waterfall(tasks, function(err, state) {
    return callback(err, state);
  });
};
