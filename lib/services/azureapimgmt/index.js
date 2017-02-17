/*jshint camelcase: false */
/*jshint newcap: false */

'use strict';

var svcConfig = require('./service');

var provisioning = require('./provisioning');
var binding = require('./binding');

var Handlers = { };

Handlers.catalog = function(log, params, next) {
  log.debug('ApiManagement - catalog() - params: %j', params);
  return next(null, svcConfig);
};

Handlers.generateAzureInstanceId = provisioning.generateAzureInstanceId;
Handlers.provision = provisioning.provision;
Handlers.poll = provisioning.poll;
Handlers.deprovision = provisioning.deprovision;

Handlers.bind = binding.bind;
Handlers.unbind = binding.unbind;

module.exports = Handlers;
