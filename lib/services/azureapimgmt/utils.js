/*jshint camelcase: false */
/*jshint newcap: false */

'use strict';

var request = require('request');
var util = require('util');
var httpStatus = require('http-status-codes');

var common = require('../../common');
var helper = require('../../common/waterfall-helper');
var svcConfig = require('./service');

var getConfig = function(state) {
  state.log.debug('ApiManagement - getConfig() - state: %j', state);

  var environmentName = state.params.azure.environment;
  var azure = state.params.azure || { };
  var parameters = state.params.parameters || { };
  var provisioningResult = state.params.provisioning_result ? JSON.parse(state.params.provisioning_result) : { };
  var bindParameters = state.params.binding_parameters || { };
  var bindingResult = state.params.binding_result ? JSON.parse(state.params.binding_result) : { };

  var config = {
    'endpoint': common.getEnvironment(environmentName).resourceManagerEndpointUrl,
    'apiVersion': common.API_VERSION[environmentName].APIMANAGEMENT,
    'subscriptionId': azure.subscriptionId,
    'resourceGroupName': parameters.resourceGroup,
    'serviceInstanceName': parameters.serviceInstance,

    'location': parameters.location,
    'tags': parameters.tags,
    'sku': svcConfig.plans.find(function(p) { return p.id == state.params.plan_id }).name,
    'units': parameters.units || 1,
    'publisherEmail': parameters.publisherEmail,

    'apiId': bindParameters.apiId || bindingResult.apiId,
    'apiName': bindParameters.apiName,
    'apiDescription': bindParameters.description,
    'serviceUrl': bindParameters.serviceUrl,
    'path': bindParameters.path,
    'protocols': bindParameters.protocols,

    'serviceInstancePath': provisioningResult.id,
  };
  
  state.log.debug('ApiManagement - getConfig() - config: %j', config);
  
  return config;
}

// Check whether or not the supplied service instance is in use.  If the plan is
// for an existing server, error if the name is not in use; otherwise error if it is.
exports.checkServiceInstanceNameAvailability = function(state, callback) {
  state.log.debug('ApiManagement - checkServiceInstanceNameAvailability() - state: %j', state);
  
  var config = getConfig(state);
  var requiredArgs = ['endpoint', 'subscriptionId', 'apiVersion', 'serviceInstanceName', 'sku'];
  var errMsg = common.verifyParameters(config, requiredArgs);
  if (errMsg) {
    state.log.error('ApiManagement - checkServiceInstanceNameAvailability(): %s', errMsg);
    var err = new Error(errMsg);
    err.statusCode = httpStatus.BAD_REQUEST;
    return callback(err, state);
  }

  request({
    'url': util.format('%s/subscriptions/%s/providers/Microsoft.ApiManagement/checkNameAvailability',
      config.endpoint,
      config.subscriptionId),
    'qs': { 'api-version' : config.apiVersion },
    'method': 'POST',
    'headers': helper.initializeRequestHeaders(state, 'ApiManagement - checkServiceInstanceNameAvailability'),
    'json': {
      'name': config.serviceInstanceName, },
  },
  function(err, response, body) {
    common.logHttpResponse(state.log, response, 'ApiManagement - checkServiceInstanceNameAvailability', true);
    if (!err) {
      switch (response.statusCode) {
        case httpStatus.OK:
          state.result = body;
          if (config.sku == 'Existing' && body.nameAvailable) {
            err = new Error("Instance name was not found");
          }
          else if (config.sku != 'Existing' && !body.nameAvailable) {
            err = new Error("Instance name is already in use");
          }
          break;
      
        default:
          err = body.error || new Error("Unexpected HTTP status code");
          err.statusCode = response.statusCode;
      }
    }

    if (err) state.log.error('ApiManagement - checkServiceInstanceNameAvailability(): %j', err);
    callback(err, state);
  });
}

exports.createOrUpdateServiceInstance = function(state, callback) {
  state.log.debug('ApiManagement - createOrUpdateServiceInstance() - state: %j', state);
  
  var config = getConfig(state);
  if (config.sku == 'Existing') {
    // Skip if the plan calls for using an existing server.  Throwing an error would make the
    // code for Handle.provision more complicated; this is simpler.
    return callback(null, state);
  }
  var requiredArgs = ['endpoint', 'subscriptionId', 'resourceGroupName', 'serviceInstanceName', 'apiVersion',
    'location', 'sku', 'units', 'publisherEmail'];
  var errMsg = common.verifyParameters(config, requiredArgs);
  if (errMsg) {
    state.log.error('ApiManagement - createOrUpdateServiceInstance(): %s', errMsg);
    var err = new Error(errMsg);
    err.statusCode = httpStatus.BAD_REQUEST;
    return callback(err, state);
  }

  request({
    'url': util.format('%s/subscriptions/%s/resourceGroups/%s/providers/Microsoft.ApiManagement/service/%s',
      config.endpoint,
      config.subscriptionId,
      config.resourceGroupName,
      config.serviceInstanceName),
    'qs': { 'api-version' : config.apiVersion },
    'method': 'PUT',
    'headers': helper.initializeRequestHeaders(state, 'ApiManagement - createOrUpdateServiceInstance'),
    'json': {
      'location': config.location,
      'name': config.serviceInstanceName,
      'tags': config.tags,
      'sku': {
        'name': config.sku,
        'capacity': config.units,
      },
      'properties': {
        'publisherEmail': config.publisherEmail,
      },
    }
  },
  function(err, response, body) {
    common.logHttpResponse(state.log, response, 'ApiManagement - createOrUpdateServiceInstance', true);
    if (!err) {
      switch (response.statusCode) {
        case httpStatus.OK:
        case httpStatus.CREATED:
        case httpStatus.ACCEPTED:
          state.result = body;
          break;
      
        default:
          err = body.error || new Error("Unexpected HTTP status code");
          err.statusCode = response.statusCode;
      }
    }

    if (err) state.log.error('ApiManagement - createOrUpdateServiceInstance(): %j', err);
    callback(err, state);
  });
};

exports.getServiceInstance = function(state, callback) {
  state.log.debug('ApiManagement - getServiceInstance() - state: %j', state);

  var config = getConfig(state);
  var requiredArgs = ['endpoint', 'subscriptionId', 'resourceGroupName', 'serviceInstanceName', 'apiVersion'];
  var errMsg = common.verifyParameters(config, requiredArgs);
  if (errMsg) {
    state.log.error('ApiManagement - getServiceInstance(): %s', errMsg);
    var err = new Error(errMsg);
    err.statusCode = httpStatus.BAD_REQUEST;
    return callback(err, state);
  }

  request({
    url: util.format('%s/subscriptions/%s/resourceGroups/%s/providers/Microsoft.ApiManagement/service/%s',
      config.endpoint,
      config.subscriptionId,
      config.resourceGroupName,
      config.serviceInstanceName),
    qs: {
      'api-version' : config.apiVersion, },
    method: 'GET',
    headers: helper.initializeRequestHeaders(state, 'ApiManagement - getServiceInstance')
  },
  function(err, response, body) {
    common.logHttpResponse(state.log, response, 'ApiManagement - getServiceInstance', true);
    if (!err) {
      body = JSON.parse(body);
      switch (response.statusCode) {
        case httpStatus.OK:
          state.result = body;
          break;

        case httpStatus.NOT_FOUND:
          err = new Error(body.message);
          err.statusCode = response.statusCode;
          break;

        default:
          err = body.error || new Error("Unexpected HTTP status code");
          err.statusCode = response.statusCode;
      }
    }
    
    if (err) state.log.error('ApiManagement - getServiceInstance(): %j', err);
    callback(err, state);
  });
}

exports.deleteServiceInstance = function(state, callback) {
  state.log.debug('ApiManagement - deleteServiceInstance() - state: %j', state);
  
  var config = getConfig(state);
  if (config.sku == 'Existing') {
    // Skip if the service instance was not originally created by the broker.  Throwing an error would make the
    // code for Handle.deprovision more complicated; this is simpler.
    return callback(null, state);
  }
  var requiredArgs = ['endpoint', 'subscriptionId', 'resourceGroupName', 'serviceInstanceName', 'apiVersion'];
  var errMsg = common.verifyParameters(config, requiredArgs);
  if (errMsg) {
    state.log.error('ApiManagement - deleteServiceInstance(): %s', errMsg);
    var err = new Error(errMsg);
    err.statusCode = httpStatus.BAD_REQUEST;
    return callback(err, state);
  }

  request({
    'url': util.format('%s/%s',
      config.endpoint,
      config.serviceInstancePath),
    qs: {
      'api-version' : config.apiVersion, },
    method: 'DELETE',
    headers: helper.initializeRequestHeaders(state, 'ApiManagement - deleteServiceInstance')
  },
  function(err, response, body) {
    common.logHttpResponse(state.log, response, 'ApiManagement - deleteServiceInstance', true);
    if (!err) {
      body = JSON.parse(body);
      switch (response.statusCode) {
        case httpStatus.OK:
        case httpStatus.NO_CONTENT:
          state.result = body;
          break;

        case httpStatus.NOT_FOUND:
          err = new Error(body.message);
          err.statusCode = response.statusCode;
          break;
      
        default:
          err = body.error || new Error("Unexpected HTTP status code");
          err.statusCode = response.statusCode;
      }
    }
    
    if (err) state.log.error('ApiManagement - deleteServiceInstance(): %j', err);
    callback(err, state);
  });
}

exports.createOrUpdateApi = function(state, callback) {
  state.log.debug('ApiManagement - createOrUpdateApi() - state: %j', state);

  var config = getConfig(state);
  var requiredArgs = ['endpoint', 'subscriptionId', 'resourceGroupName', 'serviceInstanceName', 'apiId', 'apiVersion',
    'apiName', 'serviceUrl', 'path', 'protocols'];
  var errMsg = common.verifyParameters(config, requiredArgs);
  if (errMsg) {
    state.log.error('ApiManagement - createOrUpdateApi(): %s', errMsg);
    var err = new Error(errMsg);
    err.statusCode = httpStatus.BAD_REQUEST;
    return callback(err, state);
  }

  request({
    'url': util.format('%s/subscriptions/%s/resourceGroups/%s/providers/Microsoft.ApiManagement/service/%s/apis/%s',
      config.endpoint,
      config.subscriptionId,
      config.resourceGroupName,
      config.serviceInstanceName,
      config.apiId),
    'qs': { 'api-version' : config.apiVersion },
    'method': 'PUT',
    'headers': helper.initializeRequestHeaders(state, 'ApiManagement - createOrUpdateApi'),
    'json': {
      'name': config.apiName,
      'description': config.apiDescription,
      'serviceUrl': config.serviceUrl,
      'path': config.path,
      'protocols': config.protocols,
    }
  },
  function(err, response, body) {
    state.log.debug('ApiManagement - createOrUpdateApi - response: %j', response);
    common.logHttpResponse(state.log, response, 'ApiManagement - createOrUpdateApi', true);
    if (!err) {
      switch (response.statusCode) {
        case httpStatus.CREATED:
        case httpStatus.NO_CONTENT:
          state.result = { 'apiId': config.apiId }
          break;
      
        default:
          err = body.error || new Error("Unexpected HTTP status code");
          err.statusCode = response.statusCode;
      }
    }

    if (err) state.log.error('ApiManagement - createOrUpdateApi(): %j', err);
    callback(err, state);
  });
}

exports.getApi = function(state, callback) {
  state.log.debug('ApiManagement - getApi() - state: %j', state);

  var config = getConfig(state);
  var requiredArgs = ['endpoint', 'serviceInstancePath', 'apiId', 'apiVersion'];
  var errMsg = common.verifyParameters(config, requiredArgs);
  if (errMsg) {
    state.log.error('getApi(): %s', errMsg);
    var err = new Error(errMsg);
    err.statusCode = httpStatus.BAD_REQUEST;
    return callback(err, state);
  }

  request({
    'url': util.format('%s/%s/apis/%s',
      config.endpoint,
      config.serviceInstancePath,
      config.apiId),
    qs: {
      'api-version' : config.apiVersion, },
    method: 'GET',
    headers: helper.initializeRequestHeaders(state, 'ApiManagement - getApi')
  },
  function(err, response, body) {
    state.log.debug('ApiManagement - deleteApi - response: %j', response);
    common.logHttpResponse(state.log, response, 'ApiManagement - getApi', true);
    if (!err) {
      body = JSON.parse(body);
      switch (response.statusCode) {
        case httpStatus.OK:
          state.result = body;
          break;

        case httpStatus.NOT_FOUND:
          err = new Error(body.message);
          err.statusCode = response.statusCode;
          break;

        default:
          err = body.error || new Error("Unexpected HTTP status code");
          err.statusCode = response.statusCode;
      }
    }

    if (err) state.log.error('ApiManagement - getApi(): %j', err)
    else state.log.debug('ApiManagement - getApi(): %j', state.result);
    callback(err, state);
  });
}

exports.deleteApi = function(state, callback) {
  state.log.debug('ApiManagement - deleteApi() - state: %j', state);

  var config = getConfig(state);
  var requiredArgs = ['endpoint', 'serviceInstancePath', 'apiId', 'apiVersion'];
  var errMsg = common.verifyParameters(config, requiredArgs);
  if (errMsg) {
    state.log.error('deleteApi(): %s', errMsg);
    var err = new Error(errMsg);
    err.statusCode = httpStatus.BAD_REQUEST;
    return callback(err, state);
  }

  var headers = helper.initializeRequestHeaders(state, 'ApiManagement - deleteApi');
  headers['If-Match'] = '*';

  request({
    'url': util.format('%s/%s/apis/%s',
      config.endpoint,
      config.serviceInstancePath,
      config.apiId),
    'qs': {
      'api-version' : config.apiVersion, },
    'method': 'DELETE',
    'headers': headers
  },
  function(err, response, body) {
    state.log.debug('ApiManagement - deleteApi - response: %j', response);
    common.logHttpResponse(state.log, response, 'ApiManagement - deleteApi', true);
    if (!err) {
      switch (response.statusCode) {
        case httpStatus.NO_CONTENT:
          state.result = { };
          break;

        case httpStatus.NOT_FOUND:
          err = new Error(body.message);
          err.statusCode = response.statusCode;
          break;
      
        default:
          err = body.error || new Error("Unexpected HTTP status code");
          err.statusCode = response.statusCode;
      }
    }

    if (err) state.log.error('ApiManagement - deleteApi(): %j', err);
    callback(err, state);
  });
}