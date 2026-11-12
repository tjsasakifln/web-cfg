const { projectCommerceHttp } = require('../../runtime/project-commerce/http.cjs');
const { projectServiceHttp } = require('../../runtime/project-commerce/service-http.cjs');
exports.handler = event => String(event.queryStringParameters?.op || '').startsWith('service-') ?
  projectServiceHttp.api(event) : projectCommerceHttp.api(event);
