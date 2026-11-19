const { projectCommerceHttp } = require('../../runtime/project-commerce/http.cjs');
const { projectServiceHttp } = require('../../runtime/project-commerce/service-http.cjs');
exports.handler = event => event.queryStringParameters?.flow === 'service' ?
  projectServiceHttp.webhook(event) : projectCommerceHttp.webhook(event);
