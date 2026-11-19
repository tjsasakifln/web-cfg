const { commerceHttp } = require('../../runtime/tools-commerce/http.cjs');
const { projectServiceHttp } = require('../../runtime/project-commerce/service-http.cjs');
exports.handler = event => commerceHttp.webhook(event, { onUnmatchedOrder: projectServiceHttp.observeSharedWebhook });
