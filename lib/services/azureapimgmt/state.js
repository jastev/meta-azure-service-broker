/*jshint camelcase: false */
/*jshint newcap: false */

'use strict';

var util = require('util');

var common = require('../../common');
var svcConfig = require('./service');

// This initializes a private namespace within state for use by the service module
exports.initializeApiManagementState = function(state, callback) {
  state.log.debug('ApiManagement - initializeApiManagementState() - input state: %j', state);

  var err;

  var azure = state.params.azure || { };

  var pResult = state.params.provisioning_result ? JSON.parse(state.params.provisioning_result) : { };
  var pParameters = state.params.parameters || { };
  var instanceParameters = pParameters.instance;

  var bResult = state.params.binding_result ? JSON.parse(state.params.binding_result) : { };
  var bParameters = state.params.binding_parameters || { };
  var productParameters = bParameters.product;
  var userParameters = bParameters.user;
  var apiParameters = bParameters.api;
  var operationsParameters = bParameters.operations;

  var bResource = state.params.bind_resource || { };
  var firstDot = bResource.route? bResource.route.indexOf('.') : 0;
  var bRoute = firstDot ? [ bResource.route.substr(0, firstDot), bResource.route.substr(firstDot + 1) ] : [null, null];

  state.apimgmt = { };
  state.apimgmt.provisioning = {
    'parameters': pParameters,
    'plan': svcConfig.plans.find(function(p) { return p.id == state.params.plan_id; }),
    'lastOperation': state.params.last_operation,
  };
  state.apimgmt.binding = {
    'parameters': bParameters,
    'resource': bResource,
  };
  state.apimgmt.azure = {
    'endpoint': common.getEnvironment(azure.environment).resourceManagerEndpointUrl,
    'subscriptionId': azure.subscriptionId,
    'resourceGroup': pResult.resourceGroup || pParameters.resourceGroup || azure.defaultResourceGroup || 'CloudFoundryServiceBroker',
    'armApiVersion': common.API_VERSION[azure.environment].APIMANAGEMENT,
    'location': azure.defaultLocation,
  };
  state.apimgmt.service = { };
  state.apimgmt.instance = instanceParameters || { 
    'name': pResult.instanceName || state.params.space_guid,
    'location': azure.defaultLocation,
    'sku': {
      'name': state.apimgmt.provisioning.plan.name != 'Existing' ? state.apimgmt.provisioning.plan.name : 'Developer',
    },
    'properties': {
      'publisherEmail': 'bit-bucket@test.smtp.org'
    }
  };
  state.apimgmt.product = productParameters || {
    'id': '/products/' + (bResult.productId || bRoute[1]),
    'name': bResult.productId || bRoute[1],
    'description': bResult.productId || bRoute[1],
    'subscriptionRequired': false,
   };
  state.apimgmt.api = apiParameters || { 
    'id': '/apis/' + (bResult.apiId || bRoute[0]),
    'name': bResult.apiId || bRoute[0],
    'serviceUrl': 'https://' + bResource.route,
    'path': bRoute[0],
    'protocols': ['Https']
  };
  var time = Date.now();  // Use time to make operation names unique across instance namespace
  state.apimgmt.operations = operationsParameters || [
    {
      'id': util.format('%s/operations/%s', state.apimgmt.api.id, 'GET-' + time),
      'name': 'GET',
      'method': 'GET',
      'urlTemplate': '/*'
    },
    {
      'id': util.format('%s/operations/%s', state.apimgmt.api.id, 'POST-' + time),
      'name': 'POST',
      'method': 'POST',
      'urlTemplate': '/*'
    },
    {
      'id': util.format('%s/operations/%s', state.apimgmt.api.id, 'PUT-' + time),
      'name': 'PUT',
      'method': 'PUT',
      'urlTemplate': '/*'
    },
    {
      'id': util.format('%s/operations/%s', state.apimgmt.api.id, 'DELETE-' + time),
      'name': 'DELETE',
      'method': 'DELETE',
      'urlTemplate': '/*'
    },
    {
      'id': util.format('%s/operations/%s', state.apimgmt.api.id, 'HEAD-' + time),
      'name': 'HEAD',
      'method': 'HEAD',
      'urlTemplate': '/*'
    },
    {
      'id': util.format('%s/operations/%s', state.apimgmt.api.id, 'OPTIONS-' + time),
      'name': 'OPTIONS',
      'method': 'OPTIONS',
      'urlTemplate': '/*'
    },
    {
      'id': util.format('%s/operations/%s', state.apimgmt.api.id, 'PATCH-' + time),
      'name': 'PATCH',
      'method': 'PATCH',
      'urlTemplate': '/*'
    },
    {
      'id': util.format('%s/operations/%s', state.apimgmt.api.id, 'TRACE-' + time),
      'name': 'TRACE',
      'method': 'TRACE',
      'urlTemplate': '/*'
    },
  ];

  state.log.debug('ApiManagement - initializeApiManagementState() - output state: %j', state);
  
  return callback(err, state);
};

exports.constructProvisioningResult = function(state) {
  return {
    'resourceGroup': state.apimgmt.azure.resourceGroup,
    'instanceName': state.apimgmt.instance.name,
  };
};

exports.constructBindingResult = function(state) {
  return {
    'productId': state.apimgmt.product.id,
    'apiId': state.apimgmt.api.id,
  };
};