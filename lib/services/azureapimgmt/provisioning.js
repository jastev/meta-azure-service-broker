/*jshint camelcase: false */
/*jshint newcap: false */

'use strict';

var async = require('async');
var httpStatus = require('http-status-codes');

var helper = require('../../common/helpers');
var svcConfig = require('./service');
var stateHelper = require('./state');
var restHelper = require('./rest');

var noErr = {};  // This is a special value that we can return to break out of a waterfall (it is truthy)  

exports.generateAzureInstanceId = function(params) {
  var parameters = params.parameters || { };
  var instanceName = parameters.instance ? parameters.instance.name : params.space_guid;
  return svcConfig.name + '-' + instanceName;
};

exports.provision = function(log, params, next) {
  log.debug('ApiManagement - provision() - params: %j', params);
  var err;

  async.waterfall([
    helper.initializeState(log, params),
    helper.getToken,
    stateHelper.initializeApiManagementState,
    restHelper.getInstance,
    function(state, response, body, callback) {
      if (response.statusCode == httpStatus.OK) {
        state.apimgmt.instance = JSON.parse(body);
        return callback(noErr, state); // Break out if instance already exists
      }

      if (state.apimgmt.provisioning.plan.name == 'Existing') {
        err = new Error('Plan requires existing instance, but named instance was not found');
        return callback(err, state);
      }

      return callback(null, state);
    },
    restHelper.checkInstanceNameAvailability,
    function(state, response, body, callback) {
      if (response.statusCode != httpStatus.OK) {
        err = new Error('Unexpected HTTP status code: ' + response.statusCode);
      }
      else if (!body.nameAvailable) {
        err = new Error(body.message);
      }
      return callback(err, state);
    },
    helper.createResourceGroup,
    restHelper.createOrUpdateInstance,
    function(state, response, body, callback) {
      switch(response.statusCode) {
        case httpStatus.OK:
        case httpStatus.CREATED:
        case httpStatus.ACCEPTED:
          state.apimgmt.instance = JSON.parse(body);
          break;

        default:
          err = new Error(body.message);
      }
      return callback(err, state);
    }],
    function(err, state) {
      log.debug('ApiManagement - provision() - state: %j', state);
      if (err && err != noErr) {
        return next(err);
      }

      var reply = {
        'value': { 'dashboard_url': state.apimgmt.instance.properties.portalUrl }
      };
      return next(null, reply, stateHelper.constructProvisioningResult(state));
    }
  );
};

exports.poll = function(log, params, next) {
  log.debug('ApiManagement - poll() - params: %j', params);
  var lastOperation, replyValue;
  
  async.waterfall([
    helper.initializeState(log, params),
    helper.getToken,
    stateHelper.initializeApiManagementState,
    restHelper.getInstance,
    function(state, response, body, callback) {
      var err, currentState;

      lastOperation = state.apimgmt.provisioning.lastOperation;
      log.debug('ApiManagement - poll() - lastOperation: %s', lastOperation);

      if (lastOperation == 'provision') {
        // In the case where the plan calls for using an existing server, we still want
        // to check that it exists and is ready for use, so we follow the usual flow
        if (response.statusCode == httpStatus.OK) {
          state.apimgmt.instance = JSON.parse(body);
          currentState = state.apimgmt.instance.properties.provisioningState;
          log.debug('ApiManagement - poll() - provisioning - currentState: %s', currentState);

          switch(currentState) {
            case 'Succeeded':
              //TODO If a user was specified in the provionsing parameters, this is where we would need to create
              // and add to the Administrators group
              replyValue = {
                'state': 'succeeded',
                'description': 'Provisoning has succeeded',
              };
              break;

            case 'Created':
            case 'Activating':
            case 'Updating':
              replyValue = {
                'state': 'in progress',
                'description': 'Provisioning is in progress (' + currentState + ')',
              };
              break;

            default:
              replyValue = {
                'state': 'failed',
                'description': 'Provisioning has failed (' + currentState + ')',
              };
          }
        }
        else if (response.statusCode == httpStatus.NOT_FOUND) {
          replyValue = {
            'state': 'failed',
            'description': 'Provisioning has failed (' + response.statusCode + ')',
          };
        }
        else { // We should never reach this; other status codes should have raised an error previously
          err = new Error('Unexpected HTTP status: ' + response.statusCode);
        }
      }
      else if (lastOperation == 'deprovision') {
        if (state.apimgmt.provisioning.plan.name == 'Existing') {
          // Shortcut to 'success' state if the service instance was not created by the broker.
          // This will allow the broker to add/remove the existing server to/from the service
          // registry without affecting the Azure resource.  We need this here because the broker
          // returns ACCEPTED to the deprovision request, so CF will always poll at least once
          replyValue = {
            'state': 'succeeded',
            'description': 'Deprovisioning has succeeded',
          };
        }
        else if (response.statusCode == httpStatus.OK) {
          state.apimgmt.instance = JSON.parse(body);
          currentState = state.apimgmt.instance.properties.provisioningState;
          log.debug('ApiManagement - poll() - deprovisioning - currentState: %s', currentState);

          switch(currentState) {
            case 'Deleted':
              replyValue = {
                'state': 'succeeded',
                'description': 'Deprovisoning has succeeded',
              };
              break;

            case 'Stopped':
            case 'Terminating':
              replyValue = {
                'state': 'in progress',
                'description': 'Deprovisioning is in progress (' + currentState + ')',
              };
              break;

            default:
              replyValue = {
                'state': 'failed',
                'description': 'Deprovisioning has failed (' + currentState + ')',
              };              
          }
        }
        else if (response.statusCode == httpStatus.NOT_FOUND) {
          replyValue = {
            'state': 'succeeded',
            'description': 'Deprovisioning has succeeded',
          };
          err = null;
        }
        else {
          err = new Error('Unexpected HTTP status: ' + response.statusCode);
        }
      }

      return callback(err, state);
    }
  ],
  function(err, state) {
    if (err && err != noErr) {
      return next(err);
    }
    return next(null, lastOperation, { 'value': replyValue }, stateHelper.constructProvisioningResult(state));
  });
};

exports.deprovision = function(log, params, next) {
  log.debug('ApiManagement - deprovision() - params: %j', params);

  async.waterfall([
      helper.initializeState(log, params),
      helper.getToken,
      stateHelper.initializeApiManagementState,
      function(state, callback) {
        if (state.apimgmt.provisioning.plan.name == 'Existing') {
          return callback(noErr, state);
        }
        return callback(null, state);  
      },
      restHelper.deleteInstance
    ],
    function(err, state) {
      log.debug('ApiManagement - deprovision() - state: %j', state);
      if (err && err != noErr) {
        return next(err);
      }
      return next(null, { 'value': { } });
  });
};
