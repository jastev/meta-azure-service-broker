/*jshint camelcase: false */
/*jshint newcap: false */

'use strict';

var async = require('async');
var util = require('util');
var _ = require('underscore');
var httpStatus = require('http-status-codes');

var utils = require('./utils');
var svcConfig = require('./service');
var common = require('../../common/');
var helper = require('../../common/waterfall-helper');

var Handlers = { };

Handlers.generateAzureInstanceId = function(params) {
  var serviceInstanceName = params.parameters.service_instance_name || params.parameters.serviceInstance;
  return svcConfig.name + '-' + serviceInstanceName;
};

Handlers.catalog = function(log, params, next) {
  log.debug('ApiManagement - catalog() - params: %j', params);
  return next(null, svcConfig);
};

Handlers.provision = function(log, params, next) {
  log.debug('ApiManagement - provision() - params: %j', params);

  async.waterfall([
      helper.initializeState(log, params),
      helper.getToken,
      utils.checkServiceInstanceNameAvailability,
      helper.createResourceGroup,
      utils.createOrUpdateServiceInstance,
    ],
    function(err, state) {
      log.debug('ApiManagement - provision() - state: %j', state);
      if (err) {
        return next(err);
      }
      else {
        var reply = {
          'statusCode': httpStatus.ACCEPTED,
          'code': httpStatus.getStatusText(httpStatus.ACCEPTED),
          'value': { }
        };
        return next(null, reply, state.result);
    }
  });
};

Handlers.poll = function(log, params, next) {
  log.debug('ApiManagement - poll() - params: %j', params);

  async.waterfall([
      helper.initializeState(log, params),
      helper.getToken,
      utils.getServiceInstance
    ],
    function(err, state) {
      log.debug('ApiManagement - poll() - state: %j', state);

      var currentState, replyValue;

      var lastOperation = params.last_operation;
      log.debug('ApiManagement - poll() - lastOperation: %s', lastOperation);

      if (lastOperation == 'provision') {
        // In the case where the plan calls for using an existing server, we still want
        // to check that it exists and is ready for use, so we follow the usual flow
        if (!err) {
          currentState = state.result.properties.provisioningState;
          log.debug('ApiManagement - poll() - provisioning - currentState: %s', currentState);

          switch(currentState) {
            case 'Succeeded':
              replyValue = {
                'state': 'succeeded',
                'description': "Provisoning has succeeded",
              };
              break;

            case 'Created':
            case 'Activating':
            case 'Updating':
              replyValue = {
                'state': 'in progress',
                'description': "Provisioning is in progress (" + currentState + ")",
              };
              break;

            default:
              replyValue = {
                'state': 'failed',
                'description': "Provisioning has failed (" + currentState + ")",
              };
          }
        }
      }
      else if (lastOperation == 'deprovision') {
        if (svcConfig.plans.find(function(p) { return p.id == params.plan_id }).name == 'Existing') {
          // Shortcut to 'success' state if the service instance was not created by the broker.
          // This will allow the broker to add/remove the existing server to/from the service
          // registry without affecting the Azure resource.
          replyValue = {
            'state': 'succeeded',
            'description': 'Deprovisioning has succeeded',
          }
          err = null;
        }
        else if (!err) {
          currentState = state.result.properties.provisioningState;
          log.debug('ApiManagement - poll() - deprovisioning - currentState: %s', currentState);
          switch(currentState) {
            case 'Deleted':
               replyValue = {
                'state': 'succeeded',
                'description': "Deprovisoning has succeeded",
              };
              break;

            case 'Stopped':
            case 'Terminating':
              replyValue = {
                'state': 'in progress',
                'description': "Deprovisioning is in progress (" + currentState + ")",
              };
              break;

            default:
              replyValue = {
                'state': 'failed',
                'description': "Deprovisioning has failed (" + currentState + ")",
              };
             
          }
        }
        else if (err.statusCode == httpStatus.NOT_FOUND) {
          replyValue = {
            'state': 'succeeded',
            'description': 'Deprovisioning has succeeded',
          }
          err = null;
        }
      }

      log.debug('ApiManagement - poll() - replyValue: %j', replyValue);

      var reply = {
        'statusCode': httpStatus.OK,
        'code': httpStatus.getStatusText(httpStatus.OK),
        'value': replyValue,
      };

      next(err, lastOperation, reply, state.result);
    });
};

Handlers.deprovision = function(log, params, next) {
  log.debug('ApiManagement - deprovision() - params: %j', params);

  async.waterfall([
      helper.initializeState(log, params),
      helper.getToken,
      utils.deleteServiceInstance
    ],
    function(err, state) {
      log.debug('ApiManagement - deprovision() - state: %j', state);
      if (err) {
        return next(err);
      }
      else {
        var reply = {
          'statusCode': httpStatus.ACCEPTED,
          'code': httpStatus.getStatusText(httpStatus.ACCEPTED),
          'value': {}
        };
        return next(null, reply, state.result);
    }
  });
};

Handlers.bind = function(log, params, next) {
  log.debug('ApiManagement - bind() - params: %j', params);

  async.waterfall([
      helper.initializeState(log, params),
      helper.getToken,
      utils.createOrUpdateApi
    ],
    function(err, state) {
      log.debug('ApiManagement - bind() - state: %j', state);
      var reply;
      if (! err) {
        reply = {
          'statusCode': httpStatus.CREATED,
          'code': httpStatus.getStatusText(httpStatus.CREATED),
          'value': { }
        };
      }
      next(err, reply, state.result);
    });
};

Handlers.unbind = function(log, params, next) {
  log.debug('ApiManagement - unbind() - params: %j', params);

  async.waterfall([
      helper.initializeState(log, params),
      helper.getToken,
      utils.deleteApi
    ],
    function(err, state) {
      log.debug('ApiManagement - unbind() - state: %j', state);
      var reply;
      if (! err) {
        reply = {
          'statusCode': httpStatus.CREATED,
          'code': httpStatus.getStatusText(httpStatus.CREATED),
          'value': { }
        };
      }
      next(err, reply, state.result);
    });
};

module.exports = Handlers;
