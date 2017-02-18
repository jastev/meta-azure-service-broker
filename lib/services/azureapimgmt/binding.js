/*jshint camelcase: false */
/*jshint newcap: false */

'use strict';

var async = require('async');
var httpStatus = require('http-status-codes');

var helper = require('../../common/helpers');
var stateHelper = require('./state');
var restHelper = require('./rest');

var noErr = {};  // This is a special value that we can return to break out of a waterfall (it is truthy)  

exports.bind = function(log, params, next) {
  log.debug('ApiManagement - bind() - params: %j', params);
  var err;

  async.waterfall([
      helper.initializeState(log, params),
      helper.getToken,
      stateHelper.initializeApiManagementState,
      restHelper.getProduct,
      function(state, response, body, callback) {
        if (response.statusCode == httpStatus.OK) {
          state.apimgmt.product = JSON.parse(body);
          return callback(null, state);
        }

        if (state.apimgmt.provisioning.plan.name == 'Existing') {
          err = new Error('Plan requires existing product, but named product was not found');
          return callback(err, state);
        }

        async.waterfall([
            function(innerCallback) { return innerCallback(null, state); },
            restHelper.createOrUpdateProduct,
            restHelper.httpStatus2XXCheck,
          ],
          function(innerErr) { err = innerErr; }
        );

        return callback(err, state);
      },
      restHelper.getApi,
      function(state, response, body, callback) {
        if (response.statusCode == httpStatus.OK) {
          err = new Error('API already exists');
        }
        return callback(err, state);
      },
      restHelper.createOrUpdateApi,
      restHelper.httpStatus2XXCheck,
      restHelper.addApiToProduct,
      restHelper.httpStatus2XXCheck,
      function(state, callback) { state.apimgmt.product.state = 'published'; callback(null, state); },
      restHelper.updateProduct,
      restHelper.httpStatus2XXCheck,
      restHelper.createOrUpdateApiOperations,
      restHelper.getInstance,
      restHelper.httpStatus2XXCheck,
      function(state, callback) { state.apimgmt.instance = JSON.parse(state.result); callback(null, state); },
    ],
    function(err, state) {
      log.debug('ApiManagement - bind() - state: %j', state);
      var reply;
      if (!err || err == noErr) {
        reply = {
          'value': {
            'route_service_url': state.apimgmt.instance.properties.runtimeUrl + '/' + state.apimgmt.api.path,
          }
        };
      }
      next(err, reply, stateHelper.constructBindingResult(state));
    });
};

exports.unbind = function(log, params, next) {
  log.debug('ApiManagement - unbind() - params: %j', params);

  async.waterfall([
      helper.initializeState(log, params),
      helper.getToken,
      stateHelper.initializeApiManagementState,
      restHelper.deleteApi
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
      next(err, reply);
    });
};