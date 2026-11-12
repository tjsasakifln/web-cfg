'use strict';
const { marketplaceGateway } = require('../../runtime/marketplace/gateway.cjs');
exports.handler = marketplaceGateway.webhook;
